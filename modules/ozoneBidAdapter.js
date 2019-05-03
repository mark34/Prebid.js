import * as utils from '../src/utils';
import { Renderer } from '../src/Renderer'
import { registerBidder } from '../src/adapters/bidderFactory';
import { BANNER, NATIVE, VIDEO } from '../src/mediaTypes';
import {config} from '../src/config';

const BIDDER_CODE = 'ozone';

// const OZONEURI = 'https://elb.the-ozone-project.com/openrtb2/auction';
// const OZONEURI = 'https://www.betalyst.com/test/ozone_stubs/video_response.php'; // appnexus
const OZONEURI = 'https://www.betalyst.com/test/ozone_stubs/unruly_video.php';
const OZONECOOKIESYNC = 'https://elb.the-ozone-project.com/static/load-cookie.html';
const OZONEVERSION = '1.4.7-test';
export const spec = {
  code: BIDDER_CODE,

  supportedMediaTypes: ['video', 'banner'],

  /**
   * Basic check to see whether required parameters are in the request.
   * @param bid
   * @returns {boolean}
   */
  isBidRequestValid(bid) {
    if (!(bid.params.hasOwnProperty('placementId'))) {
      utils.logInfo('OZONE: OZONE BID ADAPTER VALIDATION FAILED : missing placementId : siteId, placementId and publisherId are REQUIRED');
      return false;
    }
    if (!(bid.params.placementId).toString().match(/^[0-9]{10}$/)) {
      utils.logInfo('OZONE: OZONE BID ADAPTER VALIDATION FAILED : placementId must be exactly 10 numeric characters');
      return false;
    }
    if (!(bid.params.hasOwnProperty('publisherId'))) {
      utils.logInfo('OZONE: OZONE BID ADAPTER VALIDATION FAILED : missing publisherId : siteId, placementId and publisherId are REQUIRED');
      return false;
    }
    if (!(bid.params.publisherId).toString().match(/^[a-zA-Z0-9\-]{12}$/)) {
      utils.logInfo('OZONE: OZONE BID ADAPTER VALIDATION FAILED : publisherId must be exactly 12 alphanumieric characters including hyphens');
      return false;
    }
    if (!(bid.params.hasOwnProperty('siteId'))) {
      utils.logInfo('OZONE: OZONE BID ADAPTER VALIDATION FAILED : missing siteId : siteId, placementId and publisherId are REQUIRED');
      return false;
    }
    if (!(bid.params.siteId).toString().match(/^[0-9]{10}$/)) {
      utils.logInfo('OZONE: OZONE BID ADAPTER VALIDATION FAILED : siteId must be exactly 10 numeric characters');
      return false;
    }
    if (bid.params.hasOwnProperty('customData')) {
      if (typeof bid.params.customData !== 'object') {
        utils.logInfo('OZONE: OZONE BID ADAPTER VALIDATION FAILED : customData is not an object');
        return false;
      }
    }
    if (bid.params.hasOwnProperty('customParams')) {
      utils.logInfo('OZONE: OZONE BID ADAPTER VALIDATION FAILED : customParams should be renamed to customData');
      return false;
    }
    if (bid.params.hasOwnProperty('ozoneData')) {
      if (typeof bid.params.ozoneData !== 'object') {
        utils.logInfo('OZONE: OZONE BID ADAPTER VALIDATION FAILED : ozoneData is not an object');
        return false;
      }
    }
    if (bid.params.hasOwnProperty('lotameData')) {
      if (typeof bid.params.lotameData !== 'object') {
        utils.logInfo('OZONE: OZONE BID ADAPTER VALIDATION FAILED : lotameData is not an object');
        return false;
      }
    }
    return true;
  },
  buildRequests(validBidRequests, bidderRequest) {
    utils.logInfo('OZONE: ozone v' + OZONEVERSION + ' validBidRequests', validBidRequests, 'bidderRequest', bidderRequest);
    utils.logInfo('OZONE: buildRequests setting auctionId', bidderRequest.auctionId);
    let singleRequest = config.getConfig('ozone.singleRequest');

    singleRequest = singleRequest !== false; // undefined & true will be true
    utils.logInfo('OZONE: config ozone.singleRequest : ', singleRequest);
    let htmlParams = validBidRequests[0].params; // the html page config params will be included in each element
    let ozoneRequest = {}; // we only want to set specific properties on this, not validBidRequests[0].params
    //    ozoneRequest['id'] = utils.generateUUID();

    delete ozoneRequest.test; // don't allow test to be set in the config - ONLY use $_GET['pbjs_debug']
    if (bidderRequest.gdprConsent) {
      utils.logInfo('OZONE: ADDING GDPR info');
      ozoneRequest.regs = {};
      ozoneRequest.regs.ext = {};
      ozoneRequest.regs.ext.gdpr = bidderRequest.gdprConsent.gdprApplies === true ? 1 : 0;
      if (ozoneRequest.regs.ext.gdpr) {
        ozoneRequest.user = {};
        ozoneRequest.user.ext = {'consent': bidderRequest.gdprConsent.consentString};
      }
    } else {
      utils.logInfo('OZONE: WILL NOT ADD GDPR info');
    }
    ozoneRequest.device = {'w': window.innerWidth, 'h': window.innerHeight};
    let tosendtags = validBidRequests
      .filter(
        function(ozoneBidRequest) {
          if (ozoneBidRequest.hasOwnProperty('mediaTypes') && ozoneBidRequest.mediaTypes.hasOwnProperty(VIDEO)) {
            if (!ozoneBidRequest.mediaTypes.video.hasOwnProperty('context')) {
              utils.logInfo('OZONE: [WARNING] No context key/value in bid. Rejecting bid: ', ozoneBidRequest);
              return false;
            }
            if (ozoneBidRequest.mediaTypes.video.context !== 'outstream') {
              utils.logInfo('OZONE: [WARNING] Only outstream video is supported. Rejecting bid: ', ozoneBidRequest);
              return false;
            }
          }
          return true;
        })
      .map(ozoneBidRequest => {
        var obj = {};
        obj.id = ozoneBidRequest.bidId; // this causes a failure if we change it to something else
        // obj.id = ozoneBidRequest.adUnitCode; // (eg. 'mpu' or 'leaderboard') A unique identifier for this impression within the context of the bid request (typically, starts with 1 and increments.
        obj.tagid = (ozoneBidRequest.params.placementId).toString();
        obj.secure = window.location.protocol === 'https:' ? 1 : 0;
        // is there a banner (or nothing declared, so banner is the default)?
        let arrBannerSizes = [];
        /* NOTE - if there is sizes element in the config root then there will be a mediaTypes.banner element automatically generated for us, so this code is deprecated */
        if (!ozoneBidRequest.hasOwnProperty('mediaTypes')) {
          if (ozoneBidRequest.hasOwnProperty('sizes')) {
            utils.logInfo('OZONE: no mediaTypes detected - will use the sizes array in the config root');
            arrBannerSizes = ozoneBidRequest.sizes;
          } else {
            utils.logInfo('OZONE: no mediaTypes detected, no sizes array in the config root either. Cannot set sizes for banner type');
          }
        } else {
          if (ozoneBidRequest.mediaTypes.hasOwnProperty(BANNER)) {
            arrBannerSizes = ozoneBidRequest.mediaTypes[BANNER].sizes; /* Note - if there is a sizes element in the config root it will be pushed into here */
            utils.logInfo('OZONE: setting banner size from the mediaTypes.banner element for bidId ' + obj.id + ': ', arrBannerSizes);
          }
          // Video integration is not complete yet
          if (ozoneBidRequest.mediaTypes.hasOwnProperty(VIDEO)) {
            obj.video = ozoneBidRequest.mediaTypes[VIDEO];
            utils.logInfo('OZONE: setting video object from the mediaTypes.video element: ' + obj.id + ':', obj.video);
          }
          // Native integration is not complete yet
          if (ozoneBidRequest.mediaTypes.hasOwnProperty(NATIVE)) {
            obj.native = ozoneBidRequest.mediaTypes[NATIVE];
            utils.logInfo('OZONE: setting native object from the mediaTypes.native element: ' + obj.id + ':', obj.native);
          }
        }
        // build the banner request using banner sizes we found in either possible location:
        if (arrBannerSizes.length > 0) {
          obj.banner = {
            topframe: 1,
            w: arrBannerSizes[0][0] || 0,
            h: arrBannerSizes[0][1] || 0,
            format: arrBannerSizes.map(s => {
              return {w: s[0], h: s[1]};
            })
          };
        }
        // these 3 MUST exist - we check them in the validation method
        obj.placementId = (ozoneBidRequest.params.placementId).toString();
        obj.publisherId = (ozoneBidRequest.params.publisherId).toString();
        obj.siteId = (ozoneBidRequest.params.siteId).toString();
        // build the imp['ext'] object
        obj.ext = {'prebid': {'storedrequest': {'id': (ozoneBidRequest.params.placementId).toString()}}, 'ozone': {}};
        obj.ext.ozone.adUnitCode = ozoneBidRequest.adUnitCode; // eg. 'mpu'
        obj.ext.ozone.transactionId = ozoneBidRequest.transactionId; // this is the transactionId PER adUnit, common across bidders for this unit
        if (ozoneBidRequest.params.hasOwnProperty('customData')) {
          obj.ext.ozone.customData = ozoneBidRequest.params.customData;
        }
        if (ozoneBidRequest.params.hasOwnProperty('ozoneData')) {
          obj.ext.ozone.ozoneData = ozoneBidRequest.params.ozoneData;
        }
        if (ozoneBidRequest.params.hasOwnProperty('lotameData')) {
          obj.ext.ozone.lotameData = ozoneBidRequest.params.lotameData;
        }
        if (ozoneBidRequest.hasOwnProperty('crumbs') && ozoneBidRequest.crumbs.hasOwnProperty('pubcid')) {
          obj.ext.ozone.pubcid = ozoneBidRequest.crumbs.pubcid;
        }
        return obj;
      });
    utils.logInfo('tosendtags = ', tosendtags);

    ozoneRequest.site = {'publisher': {'id': htmlParams.publisherId}, 'page': document.location.href};
    ozoneRequest.test = parseInt(getTestQuerystringValue()); // will be 1 or 0
    //    utils.logInfo('_ozoneInternal is', _ozoneInternal);
    // return the single request object OR the array:
    if (singleRequest) {
      utils.logInfo('OZONE: buildRequests starting to generate response for a single request');
      ozoneRequest.id = bidderRequest.auctionId; // Unique ID of the bid request, provided by the exchange.
      ozoneRequest.auctionId = bidderRequest.auctionId; // not sure if this should be here?
      ozoneRequest.imp = tosendtags;
      ozoneRequest.source = {'tid': bidderRequest.auctionId}; // RTB 2.5 : tid is Transaction ID that must be common across all participants in this bid request (e.g., potentially multiple exchanges).
      var ret = {
        method: 'POST',
        url: OZONEURI,
        data: JSON.stringify(ozoneRequest),
        bidderRequest: bidderRequest
      };
      if (tosendtags.length > 0) {
        utils.logInfo('OZONE: buildRequests ozoneRequest for single = ', ozoneRequest);
        utils.logInfo('OZONE: buildRequests going to return for single: ', ret);
        return ret;
      } else {
        utils.logInfo('OZONE: no valid bid requests in potential single: ', ret);
        return null
      }
    }

    // not single request - pull apart the tosendtags array & return an array of objects each containing one element in the imp array.
    let arrRet = tosendtags.map(imp => {
      utils.logInfo('OZONE: buildRequests starting to generate non-single response, working on imp : ', imp);
      let ozoneRequestSingle = Object.assign({}, ozoneRequest);
      imp.ext.ozone.pageAuctionId = bidderRequest['auctionId']; // make a note in the ext object of what the original auctionId was, in the bidderRequest object
      ozoneRequestSingle.id = imp.ext.ozone.transactionId; // Unique ID of the bid request, provided by the exchange.
      ozoneRequestSingle.auctionId = imp.ext.ozone.transactionId; // not sure if this should be here?
      ozoneRequestSingle.imp = [imp];
      ozoneRequestSingle.source = {'tid': imp.ext.ozone.transactionId};
      utils.logInfo('OZONE: buildRequests ozoneRequestSingle (for non-single) = ', ozoneRequestSingle);
      return {
        method: 'POST',
        url: OZONEURI,
        data: JSON.stringify(ozoneRequestSingle),
        bidderRequest: bidderRequest
      };
    });

    if (tosendtags.length > 0) {
      utils.logInfo('OZONE: buildRequests going to return for non-single: ', arrRet);
      return arrRet;
    } else {
      utils.logInfo('OZONE: no valid bid requests in potential non-single: ', arrRet);
      return null;
    }
  },
  /**
   * Interpret the response if the array contains BIDDER elements, in the format: [ [bidder1 bid 1, bidder1 bid 2], [bidder2 bid 1, bidder2 bid 2] ]
   * NOte that in singleRequest mode this will be called once, else it will be called for each adSlot's response
   * @param serverResponse
   * @param request
   * @returns {*}
   */
  interpretResponse(serverResponse, request) {
    utils.logInfo('OZONE: version' + OZONEVERSION + ' interpretResponse', serverResponse, request);
    serverResponse = serverResponse.body || {};
    if (serverResponse.seatbid) {
      if (utils.isArray(serverResponse.seatbid)) {
        // serverResponse seems good, let's get the list of bids from the request object:
        let arrRequestBids = request.bidderRequest.bids;
        // build up a list of winners, one for each bidId in arrBidIds
        let arrWinners = [];
        for (let i = 0; i < arrRequestBids.length; i++) {
          let thisBid = arrRequestBids[i];
          utils.logInfo('thisBid', thisBid);
          let ozoneInternalKey = thisBid.bidId;
          let {seat: winningSeat, bid: winningBid} = ozoneGetWinnerForRequestBid(thisBid, serverResponse.seatbid);
          utils.logInfo('winningSeat = ', winningSeat );
          utils.logInfo('winningBid = ', winningBid );
          if (winningBid == null) {
            utils.logInfo('OZONE: FAILED to get winning bid for bid : ', thisBid, 'will skip. Possibly a non-single request, which will be missing some bid IDs');
            continue;
          }

          if ( winningSeat == 'unruly' && thisBid.mediaTypes.video.context == 'outstream') {
            utils.logInfo('processing unruly vid');
            // if (winningBid.ext.renderer && winningSeat == 'unruly' && thisBid.mediaTypes.video.context == 'outstream') {
            const exchangeRenderer = utils.deepAccess(winningBid, 'ext.renderer');
            utils.logInfo('exchangeRenderer = ', exchangeRenderer);
            if( !exchangeRenderer ) {
              utils.logError('FAILED to locate "etc.renderer" in outstream ad response - cannot display this ad');
            }
            else {
              configureUnrulyUniversalTag(exchangeRenderer)
              configureUnrulyRendererQueue()
              const rendererInstance = Renderer.install(Object.assign({}, exchangeRenderer, { callback: () => {} }));

              winningBid.renderer = rendererInstance

              const additionalRendererConfig = utils.deepAccess(winningBid, 'ext.additional_renderer_config')
              const rendererConfig = Object.assign(
                {
                  renderer: rendererInstance,
                  adUnitCode: thisBid.adUnitCode
                },
                additionalRendererConfig
              );
              utils.logInfo('OZONE: unruly winningBid:', winningBid)
              utils.logInfo('OZONE: unruly rendererConfig:', rendererConfig)
              rendererInstance.setRender(() => { notifyUnrulyRenderer(rendererConfig) });            }
          }

          const {defaultWidth, defaultHeight} = defaultSize(arrRequestBids[i]);
          winningBid = ozoneAddStandardProperties(winningBid, defaultWidth, defaultHeight);

          if ( winningSeat == 'appnexus' && thisBid.mediaTypes.video.context == 'outstream') {
            utils.logInfo('processing appnexus vid');
            // from https://github.com/prebid/Prebid.js/pull/1082
            if(utils.deepAccess(winningBid, 'ext.prebid.type') === VIDEO ) {
              utils.logInfo('going to attach an adResponse key to the bid');
              winningBid.adResponse = createAdResponseObject(winningBid);
              let renderConf = createObjectForInternalVideoRender(winningBid);
              winningBid.renderer = Renderer.install(renderConf);
            }
          }

          utils.logInfo('OZONE: Going to add the adserverTargeting custom parameters for key: ', ozoneInternalKey);
          let adserverTargeting = {};
          let allBidsForThisBidid = ozoneGetAllBidsForBidId(ozoneInternalKey, serverResponse.seatbid);
          // add all the winning & non-winning bids for this bidId:
          Object.keys(allBidsForThisBidid).forEach(function(bidderName, index, ar2) {
            utils.logInfo('OZONE: inside allBidsForThisBidid:foreach', bidderName, index, ar2, allBidsForThisBidid);
            adserverTargeting['oz_' + bidderName] = bidderName;
            adserverTargeting['oz_' + bidderName + '_pb'] = String(allBidsForThisBidid[bidderName].price);
            adserverTargeting['oz_' + bidderName + '_crid'] = String(allBidsForThisBidid[bidderName].crid);
            adserverTargeting['oz_' + bidderName + '_adv'] = String(allBidsForThisBidid[bidderName].adomain);
            adserverTargeting['oz_' + bidderName + '_imp_id'] = String(allBidsForThisBidid[bidderName].impid);
          });
          // now add the winner data:
          adserverTargeting['oz_auc_id'] = String(request.bidderRequest.auctionId);
          adserverTargeting['oz_winner'] = String(winningSeat);
          adserverTargeting['oz_winner_auc_id'] = String(winningBid.id);
          adserverTargeting['oz_winner_imp_id'] = String(winningBid.impid);
          adserverTargeting['oz_response_id'] = String(serverResponse.id);

          winningBid.adserverTargeting = adserverTargeting;
          utils.logInfo('OZONE: winner is', winningBid);
          arrWinners.push(winningBid);
          utils.logInfo('OZONE: arrWinners is', arrWinners);
        }
        let winnersClean = arrWinners.filter(w => {
          return (w.bidId); // will be cast to boolean
        });
        utils.logInfo('OZONE: going to return winnersClean:', winnersClean);
        return winnersClean;
      } else {
        return [];
      }
    } else {
      return [];
    }
  },
  getUserSyncs(optionsType, serverResponse) {
    if (!serverResponse || serverResponse.length === 0) {
      return [];
    }
    if (optionsType.iframeEnabled) {
      return [{
        type: 'iframe',
        url: OZONECOOKIESYNC
      }];
    }
  }
}
export function checkDeepArray(Arr) {
  if (Array.isArray(Arr)) {
    if (Array.isArray(Arr[0])) {
      return Arr[0];
    } else {
      return Arr;
    }
  } else {
    return Arr;
  }
}
export function defaultSize(thebidObj) {
  const {sizes} = thebidObj;
  const returnObject = {};
  returnObject.defaultWidth = checkDeepArray(sizes)[0];
  returnObject.defaultHeight = checkDeepArray(sizes)[1];
  return returnObject;
}

/**
 * Do the messy searching for the best bid response in the serverResponse.seatbid array matching the requestBid.bidId
 * @param requestBid
 * @param serverResponseSeatBid
 * @returns {*} bid object
 */
export function ozoneGetWinnerForRequestBid(requestBid, serverResponseSeatBid) {
  let thisBidWinner = null;
  let winningSeat = null;
  for (let j = 0; j < serverResponseSeatBid.length; j++) {
    let theseBids = serverResponseSeatBid[j].bid;
    let thisSeat = serverResponseSeatBid[j].seat;
    for (let k = 0; k < theseBids.length; k++) {
      if (theseBids[k].impid === requestBid.bidId) { // we've found a matching server response bid for this request bid
        // if (theseBids[k].impid === requestBid.adUnitCode) { // we've found a matching server response bid for this request bid
        if ((thisBidWinner == null) || (thisBidWinner.price < theseBids[k].price)) {
          thisBidWinner = theseBids[k];
          winningSeat = thisSeat;
          break;
        }
      }
    }
  }
  return {'seat': winningSeat, 'bid': thisBidWinner};
}

/**
 * Get a list of all the bids, for this bidId
 * @param matchBidId
 * @param serverResponseSeatBid
 * @returns {} = {ozone:{obj}, appnexus:{obj}, ... }
 */
export function ozoneGetAllBidsForBidId(matchBidId, serverResponseSeatBid) {
  utils.logInfo('OZONE: ozoneGetAllBidsForBidId - starting, with: ', matchBidId, serverResponseSeatBid);
  let objBids = {};
  for (let j = 0; j < serverResponseSeatBid.length; j++) {
    let theseBids = serverResponseSeatBid[j].bid;
    let thisSeat = serverResponseSeatBid[j].seat;
    for (let k = 0; k < theseBids.length; k++) {
      if (theseBids[k].impid === matchBidId) { // we've found a matching server response bid for the request bid we're looking for
        utils.logInfo('ozoneGetAllBidsForBidId - found matching bid: ', matchBidId, theseBids[k]);
        objBids[thisSeat] = theseBids[k];
      }
    }
  }
  utils.logInfo('OZONE: ozoneGetAllBidsForBidId - going to return: ', objBids);
  return objBids;
}

/**
 * We expect to be able to find a standard set of properties on winning bid objects; add them here.
 * @param seatBid
 * @returns {*}
 */
export function ozoneAddStandardProperties(seatBid, defaultWidth, defaultHeight) {
  utils.logInfo('seatBid:',  seatBid);
  seatBid.cpm = seatBid.price;
  seatBid.bidId = seatBid.impid;
  seatBid.requestId = seatBid.impid;
  seatBid.width = seatBid.w || defaultWidth;
  seatBid.height = seatBid.h || defaultHeight;
  seatBid.ad = seatBid.adm;
  seatBid.netRevenue = true;
  seatBid.creativeId = seatBid.crid;
  seatBid.currency = 'USD';
  seatBid.ttl = 60;
  return seatBid;
}

/**
 * we need to add test=1 or test=0 to the get params sent to the server.
 * Get the value set as pbjs_debug= in the url, OR 0.
 * @returns {*}
 */
export function getTestQuerystringValue() {
  let searchString = window.location.search.substring(1);
  let params = searchString.split('&');
  for (let i = 0; i < params.length; i++) {
    let val = params[i].split('=');
    if (val[0] === 'pbjs_debug') {
      return val[1] === 'true' ? 1 : 0;
    }
  }
  return 0;
}

function configureUnrulyUniversalTag (exchangeRenderer) {
  parent.window.unruly = parent.window.unruly || {};
  parent.window.unruly['native'] = parent.window.unruly['native'] || {};
  parent.window.unruly['native'].siteId = parent.window.unruly['native'].siteId || exchangeRenderer.config.siteId;
  parent.window.unruly['native'].supplyMode = 'prebid';
}

function configureUnrulyRendererQueue () {
  parent.window.unruly['native'].prebid = parent.window.unruly['native'].prebid || {};
  parent.window.unruly['native'].prebid.uq = parent.window.unruly['native'].prebid.uq || [];
}

function notifyUnrulyRenderer (rendererConfig) {
  parent.window.unruly['native'].prebid.uq.push(['render', rendererConfig]);
}


function createAdResponseObject(bid) {

  utils.logInfo('createAdResponseObject', bid);
  let obj = {
    "ad": {
        "adText": "This is the text that appears on the top right...",
        "video": {
            /* this ensures content is pushed around the player, otherwise it displays behind the page content. */
            "player_width": 640,
            "player_height": 480
        },
      "content": "VAST xml here..."
    }
  };
  obj.ad.content = bid.ad;
  let size = utils.deepAccess(bid, 'ext.prebid.targeting.hb_size');
  if(size) {
    let arrWH = size.split('x');
    if( typeof arrWH === 'object' && arrWH.length == 2) {
      obj.ad.video.player_width = arrWH[0];
      obj.ad.video.player_height = arrWH[1];
    }
  }
  obj.ad.adText = ''; // for now I don't know if there's anything that we can put here.
  return obj;
}

//
// from https://github.com/prebid/Prebid.js/pull/1082
//
function createObjectForInternalVideoRender(bid) {

  let obj = {
    url: 'http://cdn.adnxs.com/renderer/video/ANOutstreamVideo.js',
    config: createAdResponseObject(bid),
    id: 1, // an id may be present in the renderer info returned on a bid
    callback: () => onOutstreamRendererLoaded.call(null, bid)
  }
  return obj;
}

function onOutstreamRendererLoaded(bid) {
  bid.renderer.setRender(outstreamRender);
}


function outstreamRender(bid) {
  window.ANOutstreamVideo.renderAd({
    tagId: bid.adResponse.tag_id,
    sizes: [640,480],
    targetId: bid.adUnitCode, // target div id to render video
    uuid: bid.crid,
    adResponse: bid.adResponse,
    rendererOptions: bid.renderer.getConfig()
  }, handleOutstreamRendererEvents.bind(bid));
}

function handleOutstreamRendererEvents(id, eventName) {
  const bid = this;
  bid.renderer.handleVideoEvent({ id, eventName });
}

//
// end of https://github.com/prebid/Prebid.js/pull/1082
//



registerBidder(spec);
utils.logInfo('OZONE: ozoneBidAdapter ended');
