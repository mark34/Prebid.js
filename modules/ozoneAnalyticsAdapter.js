/**
 * analytics adapter for ozone analytics
 * 20240222 update - unconditionally batch all events, checking whether to send them off after (config.batchIntervalSecs) default 1
 */

// import { _each, logMessage } from '../src/utils.js';
import {deepAccess, logMessage, logError, logInfo} from '../src/utils.js';
import {ajax} from '../src/ajax.js';

import CONSTANTS from '../src/constants.json';
import adapterManager from '../src/adapterManager.js';
import adapter from '../libraries/analyticsAdapter/AnalyticsAdapter.js';

// list of events we're interested in
var BID_TIMEOUT = CONSTANTS.EVENTS.BID_TIMEOUT;
var BID_RESPONSE = CONSTANTS.EVENTS.BID_RESPONSE;
var BID_WON = CONSTANTS.EVENTS.BID_WON;
var NO_BID = CONSTANTS.EVENTS.NO_BID;
var AUCTION_INIT = CONSTANTS.EVENTS.AUCTION_INIT;
var AUCTION_END = CONSTANTS.EVENTS.AUCTION_END;
var BIDDER_ERROR = CONSTANTS.EVENTS.BIDDER_ERROR;
var BID_REJECTED = CONSTANTS.EVENTS.BID_REJECTED;
var AD_RENDER_SUCCEEDED = CONSTANTS.EVENTS.AD_RENDER_SUCCEEDED;
var AD_RENDER_FAILED = CONSTANTS.EVENTS.AD_RENDER_FAILED;
var BID_VIEWABLE = CONSTANTS.EVENTS.BID_VIEWABLE;
var STALE_RENDER = CONSTANTS.EVENTS.STALE_RENDER;
var SET_TARGETING = CONSTANTS.EVENTS.SET_TARGETING;

var _analyticsQueue = [];
// var _endpoint = 'https://logging.1in39.com/ozone_analytics_202212.php'; // https://elb.the-ozone-project.com/dp.gif
var _endpoint = 'https://elb.the-ozone-project.com/csa'; // 20240213
var _sendCount = 0;
const analyticsType = 'endpoint';

/*
Options:
- choose whether to batch up the events to send or send when they occur

example:

pbjs.enableAnalytics({
    provider: 'ozoneAnalytics',
    options: {
        doBatch: true,
        maxBatchEvents: 20, // optional; when batching when we reach this number then send, as well as when the natural trigger is reached
        sampled: Math.random() > .5, // eg. you only want to sample 50% randomly chosen of all page hits
        batchIntervalSecs: 1
    }
});

 */

// override all of these in the config (we will do an Object.assign)
var configOptions = {
  doBatch: true, /* include this page in calls to server? (is this to be included in your sampled data?) */
  maxBatchEvents: 10,
  sampled: true,
  batchIntervalSecs: 1
};

var publisherId, siteId; // persist these into all server calls after we receive them

// to see what's available use the debug console to pause execution in a browser
/**
 * get the object we need to send for logging for bid response
 * @param eventType string = one of the event constants
 * @param args object `t` we get for e="bidResponse" in debug window
 * @returns {{timeToRespond, netRevenue, adserverTargeting, adUnitCode, oz_winner: null, bidder, bidId, cpmDist: null, size, adomain: string, requestId, impid, bid_price}}
 */
function mapObject(eventType, args) {
  publisherId = publisherId || deepAccess(args, 'bidderRequests.0.bids.0.params.publisherId', '');
  siteId = siteId || deepAccess(args, 'bidderRequests.0.bids.0.params.siteId', '');
  // try to find seat_name in adm like 'https://elb.the-ozone-project.com/wp.gif?currency=USD&seat_id=&request_id=3e587d1e-b250-4136-aa2d-9abc90e8f5de&adunit=advert-section-billboard-5&size=970x250&adomain=%5Bgoogle.com%5D&imp_id=68029f7f668621c&auction_id=&bid_id=4305476596305087999&crid=78827821&price=0.1014144&seat_name=ozappnexus-1&publisher_id=OZONENUK0001&dealid='
  let adm = deepAccess(args, 'adm', '');
  let match = adm.match(/seat_name=([^&"']+)/);
  let admSeat = '';
  if (match && Array.isArray(match) && match.length >= 2) {
    admSeat = match[1];
  }
  let ret = {
    publisher_id: String(publisherId), // auctionInit
    site_id: String(siteId), // auctionInit
    auction_end: String(args.auctionEnd || ''),
    request_id: String(args.auctionId || ''),
    timestamp_ms: String(args.timestamp || ''), // init
    request_timestamp_ms: String(args.requestTimestamp || ''),
    response_timestamp_ms: String(args.rsponseTimestamp || ''),
    bidder: String(args.bidder || args.bidderCode || ''), /* eg ozone */ // noBid ok. bidderCode is for error
    bid_price: String(args.originalCpm || ''),
    time_to_respond_ms: String(args.timeToRespond || ''),
    hb_bidder: String(deepAccess(args, 'adserverTargeting.hb_bidder', '')), // in bidResponse
    oz_winner: String(deepAccess(args, 'adserverTargeting.oz_winner', '')), // in bidResponse
    ad_unit_code: String(args.adUnitCode || args.adUnitCodes || ''), // noBid ok, will be adUnitCodes for auctionInit
    size: String(args.size || JSON.stringify(args.sizes) || ''), // sizes = noBid/bidTimeout
    adomain: args.adomain ? args.adomain.toString() : deepAccess(args, 'adserverTargeting.hb_adomain', ''), // noBid Ok with the conditional operator
    imp_id: String(args.requestId || ''),
    net_revenue: String(args.netRevenue || ''),
    pb_timeout: String(args.timeout || ''), // this is present on bid timeout events - might be useful; it's the prebid timeout value set for the auction
    adm_seat: String(admSeat),
    extra: String(args.extra || '')
  };
  // add conditional bits
  // if (args.bidder === 'ozone' && eventType === BID_RESPONSE) {
  //   ret.oz_winner = args.adserverTargeting.oz_winner;
  // }
  return ret;
}

// https://docs.prebid.org/dev-docs/integrate-with-the-prebid-analytics-api.html
let ozoneAnalytics = Object.assign(adapter({
  _endpoint, analyticsType
}), {
  track({eventType, args}) {
    if (!configOptions.sampled) {
      logInfo('Sampled is false, will not report analytics for this page hit');
      return;
    }
    let toSend;
    logInfo('EVENT TYPE: ' + eventType);
    switch (eventType) {
      case AUCTION_INIT:
        handleEvent('auction_init', mapObject(eventType, args), configOptions.doBatch);
        break;
      // case BID_REQUESTED: // args contains all the stuff returned from buildRequests BUT we don't want this
      //   handleEvent('bid_req', getAnalyticsObjectForBRResponse(args), configOptions.doBatch);
      //   break;
      case BID_RESPONSE:
        handleEvent('bid_response', mapObject(eventType, args), configOptions.doBatch);
        break;
      case NO_BID: // These come in AFTER ACTION_END when there was no bid for an adunit - once for each adunit
        handleEvent('no_bid', mapObject(eventType, args), configOptions.doBatch);
        break;
      case BID_TIMEOUT:
        if (Array.isArray(args) && args.length > 0) { // this is an array of bid objects
          for (let arg of args) { // send data for all bids
            handleEvent('timeout', mapObject(eventType, arg), configOptions.doBatch);
          }
        } else {
          toSend = {'auctionId': 'Failed to get any data (args: ' + String(args) + ')'};
          handleEvent('timeout', mapObject(eventType, toSend), configOptions.doBatch);
        }
        break;
      case BID_WON: // These come in AFTER ACTION_END
        handleEvent('bid_won', mapObject(eventType, args), configOptions.doBatch);
        break;
      case BIDDER_ERROR: // you can cause this by pointing to an invalid url
        toSend = {'auctionId': 'Failed to get any data'};
        if (args.hasOwnProperty('bidderRequest')) {
          toSend = args.bidderRequest;
        }
        handleEvent('bidder_error', mapObject(eventType, toSend), configOptions.doBatch);
        break;
      case BID_REJECTED: // will be a bid object with added 'rejectionReason' - see auction.js
        args.extra = args.rejectionReason;
        handleEvent('bid_rejected', mapObject(eventType, args), configOptions.doBatch);
        break;
      case AD_RENDER_SUCCEEDED:
        handleEvent('render_succeeded', mapObject(eventType, args.bid), configOptions.doBatch);
        break;
      case AD_RENDER_FAILED:
        handleEvent('render_failed', mapObject(eventType, args.bid), configOptions.doBatch);
        break;
      case BID_VIEWABLE: // note - for this to fire you need pbjs.setConfig({bidViewability: {enabled: true}})
        handleEvent('bid_viewable', mapObject(eventType, args), configOptions.doBatch);
        break;
      case STALE_RENDER:
        handleEvent('stale_render', mapObject(eventType, args), configOptions.doBatch);
        break;
      case SET_TARGETING: // args is an object like {leaderboard: {}, mpu: {}, ... } - we are going to log just the keys
        // NOTE - removed 20240226 - this is not tied to a bid/auction - it seems to be for all adunits across multiple auctions so not useful
        break;
      case AUCTION_END: // NOTE in testing I am getting 3 'bidWon' events AFTER this
        handleEvent('auction_end', mapObject(eventType, args), configOptions.doBatch);
    }
  }
});

/**
 * Unconditionally send the batch
 */
function ozoneSendBatch(waitMs) {
  if (configOptions.doBatch && _analyticsQueue.length > 0) {
    const currentQ = _analyticsQueue;
    _analyticsQueue = [];
    logInfo(`ozoneSendBatch: sending data now: ${currentQ.length} items`);
    sendData(currentQ);
  } else {
    logInfo('ozoneSendBatch: nothing to do');
  }
  setTimeout(function() { ozoneSendBatch(waitMs); }, waitMs);
}

// kick off the batch sending loop if we are set to batch mode
if (configOptions.doBatch) {
  setTimeout(function () { ozoneSendBatch(configOptions.batchIntervalSecs * 1000); }, configOptions.batchIntervalSecs * 1000);
  window.onbeforeunload = (e) => {
    const currentQ = _analyticsQueue;
    _analyticsQueue = [];
    if (currentQ.length > 0) {
      logInfo(`ozone analytics: sending final data now before page unload: ${currentQ.length} items`);
      sendData(currentQ);
    } else {
      logInfo(`ozone analytics: no final data to send before page unload`);
    }
  }
}

/**
 * Deal with this event type (name) & arbitrary object - ideally batch it up, but could be sent right now depending on config
 * @param type
 * @param obj
 * @param batch
 */
function handleEvent(type, obj, batch) {
  if (batch) {
    logInfo(`handleEvent (${type}): batch mode`);
    // push into the array
    obj.event_type = type;
    _analyticsQueue.push(obj);
    // have we reached our batch limit?
    if (configOptions.maxBatchEvents <= _analyticsQueue.length) {
      logInfo(`Batch length of ${configOptions.maxBatchEvents} reached, going to send batch & truncate the queue`);
      let aq = _analyticsQueue;
      _analyticsQueue = [];
      sendData(aq);
    }
  } else {
    // send right now
    logInfo(`handleEvent (${type}): will send single obj (as an array with one element)`);
    obj.event_type = type;
    sendData([obj]); // keep it consistent - so we always send an array.
  }
}

// save the base class function
ozoneAnalytics.originEnableAnalytics = ozoneAnalytics.enableAnalytics;

/**
 * override enableAnalytics so we can get access to the config passed in from the page
 * This will enable sending data to ozone analytics. Only call once, or duplicate data will be sent!
 * @param config object (contains options)
 */
ozoneAnalytics.enableAnalytics = function (config) {
  Object.assign(configOptions, config.options);
  ozoneAnalytics.originEnableAnalytics(config); // call the original method
};

/**
 * Simply push the object to our endpoint
 * @param obj
 */
function sendData(obj) {
  _sendCount++;
  logMessage(`*~* Going to send push no. ${_sendCount} via ajax:`, obj);
  try {
    ajax(_endpoint, function (responseText, obj) {
      logMessage(`*~* AJAX response for push no. ${_sendCount}: ` + responseText, obj);
    }, JSON.stringify(obj), {
      method: 'POST', withCredentials: true, contentType: 'application/json'
    });
  } catch (e) {
    logError('ozoneAnalytics sendData error, may not have sent analytics data:', e);
  }
}

adapterManager.registerAnalyticsAdapter({
  adapter: ozoneAnalytics,
  code: 'ozoneAnalytics', /* same as ozone bid adapter. "... your adapter will need to be linked to your IAB Global Vendor List ID" (https://docs.prebid.org/dev-docs/integrate-with-the-prebid-analytics-api.html) */
  gvlid: 524
});

export default ozoneAnalytics;
