/**
 * analytics adapter for ozone analytics
 * 20240222 update - unconditionally batch all events, checking whether to send them off after (config.batchIntervalSecs) default 1
 */

// import { _each, logMessage } from '../src/utils.js';
import { deepAccess, logMessage, logInfo, deepClone } from '../src/utils.js';
import { noCredsAjax as ajax } from '../src/ajax.js';

import { EVENTS } from '../src/constants.js';
import adapterManager from '../src/adapterManager.js';
import { auctionManager } from '../src/auctionManager.js';
import adapter from '../libraries/analyticsAdapter/AnalyticsAdapter.js';

// list of events we're interested in
var BID_TIMEOUT = EVENTS.BID_TIMEOUT;
var BID_RESPONSE = EVENTS.BID_RESPONSE;
var BID_WON = EVENTS.BID_WON;
var NO_BID = EVENTS.NO_BID;
var AUCTION_INIT = EVENTS.AUCTION_INIT;
var AUCTION_END = EVENTS.AUCTION_END;
var BIDDER_ERROR = EVENTS.BIDDER_ERROR;
var BID_REJECTED = EVENTS.BID_REJECTED;
var AD_RENDER_SUCCEEDED = EVENTS.AD_RENDER_SUCCEEDED;
var AD_RENDER_FAILED = EVENTS.AD_RENDER_FAILED;
var BID_VIEWABLE = EVENTS.BID_VIEWABLE;
var STALE_RENDER = EVENTS.STALE_RENDER;
var SET_TARGETING = EVENTS.SET_TARGETING;

var _analyticsQueue = [];
// var _endpoint = 'https://logging.1in39.com/ozone_analytics_202212.php'; // https://elb.the-ozone-project.com/dp.gif
var _endpoint = 'https://elb.the-ozone-project.com/csa'; // 20240213
var _sendCount = 0;
const analyticsType = 'endpoint';
export const ANALYTICS_VERSION = '0.2';

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
  batchIntervalSecs: 1,
  testgroupKeyName: null,
  testgroupVal: null
};

var publisherId, siteId; // persist these into all server calls after we receive them

function toLogString(value) {
  if (value == null) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.join(',');
  }
  return String(value);
}

function getFloorFields(floorData = {}) {
  return {
    floor_value: toLogString(floorData.floorValue),
    floor_rule: toLogString(floorData.floorRule),
    floor_rule_value: toLogString(floorData.floorRuleValue),
    floor_currency: toLogString(floorData.floorCurrency),
    floor_cpm_after_adjustments: toLogString(floorData.cpmAfterAdjustments),
    floor_enforce_js: toLogString(deepAccess(floorData, 'enforcements.enforceJS')),
    floor_enforce_bidders: toLogString(deepAccess(floorData, 'enforcements.enforceBidders')),
    floor_enforce_pbs: toLogString(deepAccess(floorData, 'enforcements.enforcePBS')),
    floor_deals: toLogString(deepAccess(floorData, 'enforcements.floorDeals')),
    floor_bid_adjustment: toLogString(deepAccess(floorData, 'enforcements.bidAdjustment')),
    floor_no_signal_bidders: toLogString(deepAccess(floorData, 'enforcements.noFloorSignalBidders')),
    floor_matched_media_type: toLogString(deepAccess(floorData, 'matchedFields.mediaType'))
  };
}

function getOzoneRtdFloorData(args) {
  return auctionManager.index.getBidRequest(args)?.ozoneRtdFloorData;
}

// to see what's available use the debug console to pause execution in a browser
/**
 * NOTE that the object is different for different events.
 * get the object we need to send for logging for bid response
 * @param eventType string = one of the event constants
 * @param objArgs object `t` we get for e="bidResponse" in debug window; this will basically be a bid object
 * @returns {Object}
 */
export function mapObject(eventType, objArgs, _configOptions) {
  // 20260707 - updated these from originally looking for 'bidderRequests.0.bids.0.params.publisherId' - objArgs is already just a bid, not the whole array, for bid type events.
  publisherId = publisherId || deepAccess(objArgs, 'params.publisherId', '');
  siteId = siteId || deepAccess(objArgs, 'params.siteId', '');
  // try to find seat_name in adm like 'https://elb.the-ozone-project.com/wp.gif?currency=USD&seat_id=&request_id=3e587d1e-b250-4136-aa2d-9abc90e8f5de&adunit=advert-section-billboard-5&size=970x250&adomain=%5Bgoogle.com%5D&imp_id=68029f7f668621c&auction_id=&bid_id=4305476596305087999&crid=78827821&price=0.1014144&seat_name=ozappnexus-1&publisher_id=OZONENUK0001&dealid='
  let adm = deepAccess(objArgs, 'adm', '');
  let match = adm.match(/seat_name=([^&"']+)/);
  let admSeat = '';
  if (match && Array.isArray(match) && match.length >= 2) {
    admSeat = match[1];
  }
  let ret = {
    version: ANALYTICS_VERSION,
    prebid: '$prebid.version$',
    publisher_id: String(publisherId), // auctionInit
    site_id: String(siteId), // auctionInit
    auction_end: String(objArgs.auctionEnd || ''),
    request_id: String(objArgs.auctionId || ''),
    timestamp_ms: String(objArgs.timestamp || ''), // init
    request_timestamp_ms: String(objArgs.requestTimestamp || ''),
    response_timestamp_ms: String(objArgs.responseTimestamp || ''), /* note - corrected spelling 20240422 - this was setting '' before that time */
    bidder: String(objArgs.bidder || objArgs.bidderCode || ''), /* eg ozone */ // noBid ok. bidderCode is for error
    bid_price: String(objArgs.originalCpm || ''),
    time_to_respond_ms: String(objArgs.timeToRespond || ''),
    hb_bidder: String(deepAccess(objArgs, 'adserverTargeting.hb_bidder', '')), // in bidResponse
    oz_winner: String(deepAccess(objArgs, 'adserverTargeting.oz_winner', '')), // in bidResponse
    ad_unit_code: String(objArgs.adUnitCode || objArgs.adUnitCodes || ''), // noBid ok, will be adUnitCodes for auctionInit
    size: String(objArgs.size || JSON.stringify(objArgs.sizes) || ''), // sizes = noBid/bidTimeout
    adomain: objArgs.adomain ? objArgs.adomain.toString() : deepAccess(objArgs, 'adserverTargeting.hb_adomain', ''), // noBid Ok with the conditional operator
    imp_id: String(objArgs.requestId || ''),
    net_revenue: String(objArgs.netRevenue || ''),
    pb_timeout: String(objArgs.timeout || ''), // this is present on bid timeout events - might be useful; it's the prebid timeout value set for the auction
    adm_seat: String(admSeat),
    extra: String(objArgs.extra || ''),
    ...getFloorFields(getOzoneRtdFloorData(objArgs) || objArgs.ozoneRtdFloorData || objArgs.floorData)
  };
  // add conditional bits
  if (objArgs.bidder === 'ozone' && eventType === BID_RESPONSE) {
    ret.oz_winner = objArgs.adserverTargeting.oz_winner;
  }
  if (_configOptions.testgroupKeyName !== null) {
    ret.testgroupKey = _configOptions.testgroupKeyName;
  }
  if (_configOptions.testgroupVal !== null) {
    ret.testgroupVal = _configOptions.testgroupVal.toString();
    ret.testgroup = _configOptions.testgroupVal.toString();
  }
  return ret;
}

// https://docs.prebid.org/dev-docs/integrate-with-the-prebid-analytics-api.html
let ozoneAnalytics = Object.assign(adapter({
  _endpoint, analyticsType
}), {
  track({ eventType, args }) {
    if (!configOptions.sampled) {
      logInfo('Sampled is false, will not report analytics for this page hit');
      return;
    }
    let toSend;
    logInfo('track: EVENT TYPE: ' + eventType);
    logInfo('track: args: ', args.length, deepClone(args));
    switch (eventType) {
      case AUCTION_INIT:
        handleEvent('auction_init', mapObject(eventType, args, configOptions), configOptions.doBatch);
        break;
      // case BID_REQUESTED: // args contains all the stuff returned from buildRequests BUT we don't want this
      //   handleEvent('bid_req', getAnalyticsObjectForBRResponse(args), configOptions.doBatch);
      //   break;
      case BID_RESPONSE:
        handleEvent('bid_response', mapObject(eventType, args, configOptions), configOptions.doBatch);
        break;
      case NO_BID: // These come in AFTER ACTION_END when there was no bid for an adunit - once for each adunit
        handleEvent('no_bid', mapObject(eventType, args, configOptions), configOptions.doBatch);
        break;
      case BID_TIMEOUT:
        if (Array.isArray(args) && args.length > 0) { // this is an array of bid objects
          for (let arg of args) { // send data for all bids
            handleEvent('timeout', mapObject(eventType, arg, configOptions), configOptions.doBatch);
          }
        } else {
          toSend = { 'auctionId': 'Failed to get any data (args: ' + String(args) + ')' };
          handleEvent('timeout', mapObject(eventType, toSend, configOptions), configOptions.doBatch);
        }
        break;
      case BID_WON: // These come in AFTER ACTION_END
        handleEvent('bid_won', mapObject(eventType, args, configOptions), configOptions.doBatch);
        break;
      case BIDDER_ERROR: // you can cause this by pointing to an invalid url
        toSend = { 'auctionId': 'Failed to get any data' };
        if (args.hasOwnProperty('bidderRequest')) {
          toSend = args.bidderRequest;
        }
        handleEvent('bidder_error', mapObject(eventType, toSend, configOptions), configOptions.doBatch);
        break;
      case BID_REJECTED: // will be a bid object with added 'rejectionReason' - see auction.js
        args.extra = args.rejectionReason;
        handleEvent('bid_rejected', mapObject(eventType, args, configOptions), configOptions.doBatch);
        break;
      case AD_RENDER_SUCCEEDED:
        handleEvent('render_succeeded', mapObject(eventType, args.bid, configOptions), configOptions.doBatch);
        break;
      case AD_RENDER_FAILED:
        handleEvent('render_failed', mapObject(eventType, args.bid, configOptions), configOptions.doBatch);
        break;
      case BID_VIEWABLE: // note - for this to fire you need pbjs.setConfig({bidViewability: {enabled: true}})
        handleEvent('bid_viewable', mapObject(eventType, args, configOptions), configOptions.doBatch);
        break;
      case STALE_RENDER:
        handleEvent('stale_render', mapObject(eventType, args, configOptions), configOptions.doBatch);
        break;
      case SET_TARGETING: // args is an object like {leaderboard: {}, mpu: {}, ... } - we are going to log just the keys
        // NOTE - removed 20240226 - this is not tied to a bid/auction - it seems to be for all adunits across multiple auctions so not useful
        break;
      case AUCTION_END: // NOTE in testing I am getting 3 'bidWon' events AFTER this
        handleEvent('auction_end', mapObject(eventType, args, configOptions), configOptions.doBatch);
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
  };
}

/**
 * Deal with this event type (name) & arbitrary object - ideally batch it up, but could be sent right now depending on config
 * @param type
 * @param obj
 * @param batch
 */
function handleEvent(type, obj, batch) {
  if (batch) {
    logInfo(`handleEvent (${type}): batch mode`, deepClone(obj));
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
    logInfo(`handleEvent (${type}): NOT batch mode, will send single obj (as an array with one element)`, deepClone(obj));
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
  // console.log('enableAnalytics with config: ', config);
  Object.assign(configOptions, config.options);
  logInfo('ozoneAnalytics.enableAnalytics: configOptions: ', deepClone(configOptions));
  ozoneAnalytics.originEnableAnalytics(config); // call the original method
};

/**
 * Simply push the object to our endpoint
 * @param obj
 */
function sendData(obj) {
  _sendCount++;
  logMessage(`*~* Going to send push no. ${_sendCount} via ajax:`, obj);

  // really annoying - I can't catch any network errors to report on them - prebid traps & writes them out to console!
  ajax(_endpoint, function (responseText, obj) {
    logMessage(`*~* AJAX response for push no. ${_sendCount} (ozone): ` + responseText, obj);
  }, JSON.stringify(obj), {
    // if we send withCredentials: false, contentType: 'text/plain' then this avoids CORS OPTIONS requests
    method: 'POST', withCredentials: false, contentType: 'text/plain'
  });
  //
  //
  // console.log('NOTE - TEST ENDPOINT IS BEING USED FOR OZONE ANALYTICS!!!');
  //
  // // for testing - also push to our endpoint
  // ajax('https://www.ardm.io/ozone/analytics/20240411_collector.php?page=' + encodeURIComponent(top.document.location.href), function (responseText, obj) {
  //   logMessage(`*~* AJAX response for push no. ${_sendCount} (ardm): ` + responseText, obj);
  // }, JSON.stringify(obj), {
  //   method: 'POST', withCredentials: true, contentType: 'application/json'
  // });
}

adapterManager.registerAnalyticsAdapter({
  adapter: ozoneAnalytics,
  code: 'ozoneAnalytics', /* same as ozone bid adapter. "... your adapter will need to be linked to your IAB Global Vendor List ID" (https://docs.prebid.org/dev-docs/integrate-with-the-prebid-analytics-api.html) */
  gvlid: 524
});

export default ozoneAnalytics;
