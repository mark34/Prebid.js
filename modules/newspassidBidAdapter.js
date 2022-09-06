import { logInfo, logError, deepAccess, logWarn, deepSetValue, isArray, contains, parseUrl } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, NATIVE } from '../src/mediaTypes.js';
import {config} from '../src/config.js';
import {getPriceBucketString} from '../src/cpmBucketManager.js';
import {getRefererInfo} from '../src/refererDetection.js';

// NOTE this allows us to access the pv value outside of prebid after the auction request.
// import { getStorageManager } from '../src/storageManager.js'

const BIDDER_CODE = 'newspassid';
// --- START REMOVE FOR RELEASE

// To remove this : php removecomments.php

/*
GET parameters (20211022):
pbjs_debug=true
nppf (pass in adapter as 0 or 1 based on true/false or 0/1 being passed as the query parameter value)
nppf (pass in adapter as 0 or 1 based on true/false or 0/1 being passed as the query parameter value)
nprp (possible values: 0-3 / basically any integer which we just pass along)
npip (integer again as a value)
auction=[full URL]
cookiesync=[full URL]

CONFIG :
np_request: false (do NOT make a request)
endpointOverride: {
 origin: [override the https://bidder.newspassid.com protion of auction & cookie sync urls]
 kvpPrefix: 'np'
 cookieSyncUrl: [full url]
 auctionUrl: [full url]
 singleRequest: true|false
}

 */

// NOTE THAT the gvl is available at https://iabeurope.eu/vendor-list-tcf-v2-0/

// testing fake endpoint for cookie sync new code with postMessage
// const NEWSPASSCOOKIESYNC = 'http://local.bussongs.com/prebid-cookie-sync-development.html';
// const NEWSPASSCOOKIESYNC = 'https://betalyst.local/prebid-cookie-sync-development.html';

// *** PROD ***
const ORIGIN = 'https://bidder.newspassid.com' // applies only to auction & cookie
const AUCTIONURI = '/openrtb2/auction';
const NEWSPASSCOOKIESYNC = '/static/load-cookie.html';

const NEWSPASSVERSION = '1.1.3rc20220906';

export const spec = {
  version: NEWSPASSVERSION,
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER],
  cookieSyncBag: {publisherId: null, siteId: null, userIdObject: {}}, // variables we want to make available to cookie sync
  propertyBag: {config: null, pageId: null, buildRequestsStart: 0, buildRequestsEnd: 0, endpointOverride: null}, /* allow us to store vars in instance scope - needs to be an object to be mutable */
  config_defaults: {
    'logId': 'NEWSPASSID',
    'bidder': 'newspassid',
    'auctionUrl': ORIGIN + AUCTIONURI,
    'cookieSyncUrl': ORIGIN + NEWSPASSCOOKIESYNC
  },
  /**
   * make sure that the default values are available in the propertyBag
   * @param bid Object : the bid
   */
  loadConfiguredData(bid) {
    if (this.propertyBag.config) { return; }
    this.propertyBag.config = JSON.parse(JSON.stringify(this.config_defaults));
    let bidder = bid.bidder || 'newspassid';
    this.propertyBag.config.logId = bidder.toUpperCase();
    this.propertyBag.config.bidder = bidder;
    let bidderConfig = config.getConfig(bidder) || {};
    logInfo('got bidderConfig: ', JSON.parse(JSON.stringify(bidderConfig)));
    let arrGetParams = this.getGetParametersAsObject();
    if (bidderConfig.endpointOverride) {
      if (bidderConfig.endpointOverride.origin) {
        this.propertyBag.endpointOverride = bidderConfig.endpointOverride.origin;
        this.propertyBag.config.auctionUrl = bidderConfig.endpointOverride.origin + AUCTIONURI;
        this.propertyBag.config.cookieSyncUrl = bidderConfig.endpointOverride.origin + NEWSPASSCOOKIESYNC;
      }
      if (bidderConfig.endpointOverride.cookieSyncUrl) {
        this.propertyBag.config.cookieSyncUrl = bidderConfig.endpointOverride.cookieSyncUrl;
      }
      if (bidderConfig.endpointOverride.auctionUrl) {
        this.propertyBag.endpointOverride = bidderConfig.endpointOverride.auctionUrl;
        this.propertyBag.config.auctionUrl = bidderConfig.endpointOverride.auctionUrl;
      }
    }
    try {
      if (arrGetParams.hasOwnProperty('auction')) {
        logInfo('GET: setting auction endpoint to: ' + arrGetParams.auction);
        this.propertyBag.config.auctionUrl = arrGetParams.auction;
      }
      if (arrGetParams.hasOwnProperty('cookiesync')) {
        logInfo('GET: setting cookiesync to: ' + arrGetParams.cookiesync);
        this.propertyBag.config.cookieSyncUrl = arrGetParams.cookiesync;
      }
    } catch (e) {}
    logInfo('set propertyBag.config to', this.propertyBag.config);
  },
  getAuctionUrl() {
    return this.propertyBag.config.auctionUrl;
  },
  getCookieSyncUrl() {
    return this.propertyBag.config.cookieSyncUrl;
  },
  /**
   * Basic check to see whether required parameters are in the request.
   * @param bid
   * @returns {boolean}
   */
  isBidRequestValid(bid) {
    this.loadConfiguredData(bid);
    logInfo('isBidRequestValid : ', config.getConfig(), bid);
    let adUnitCode = bid.adUnitCode; // adunit[n].code
    let err1 = 'VALIDATION FAILED : missing {param} : siteId, placementId and publisherId are REQUIRED'
    if (!(bid.params.hasOwnProperty('placementId'))) {
      logError(err1.replace('{param}', 'placementId'), adUnitCode);
      return false;
    }
    if (!this.isValidPlacementId(bid.params.placementId)) {
      logError('VALIDATION FAILED : placementId must be exactly 10 numeric characters', adUnitCode);
      return false;
    }
    if (!(bid.params.hasOwnProperty('publisherId'))) {
      logError(err1.replace('{param}', 'publisherId'), adUnitCode);
      return false;
    }
    if (!(bid.params.publisherId).toString().match(/^[a-zA-Z0-9\-]{12}$/)) {
      logError('VALIDATION FAILED : publisherId must be exactly 12 alphanumeric characters including hyphens', adUnitCode);
      return false;
    }
    if (!(bid.params.hasOwnProperty('siteId'))) {
      logError(err1.replace('{param}', 'siteId'), adUnitCode);
      return false;
    }
    if (!(bid.params.siteId).toString().match(/^[0-9]{10}$/)) {
      logError('VALIDATION FAILED : siteId must be exactly 10 numeric characters', adUnitCode);
      return false;
    }
    if (bid.params.hasOwnProperty('customParams')) {
      logError('VALIDATION FAILED : customParams should be renamed to customData', adUnitCode);
      return false;
    }
    if (bid.params.hasOwnProperty('customData')) {
      if (!Array.isArray(bid.params.customData)) {
        logError('VALIDATION FAILED : customData is not an Array', adUnitCode);
        return false;
      }
      if (bid.params.customData.length < 1) {
        logError('VALIDATION FAILED : customData is an array but does not contain any elements', adUnitCode);
        return false;
      }
      if (!(bid.params.customData[0]).hasOwnProperty('targeting')) {
        logError('VALIDATION FAILED : customData[0] does not contain "targeting"', adUnitCode);
        return false;
      }
      if (typeof bid.params.customData[0]['targeting'] != 'object') {
        logError('VALIDATION FAILED : customData[0] targeting is not an object', adUnitCode);
        return false;
      }
    }
    return true;
  },

  /**
   * Split this out so that we can validate the placementId and also the override GET parameter npstoredrequest
   * @param placementId
   */
  isValidPlacementId(placementId) {
    return placementId.toString().match(/^[0-9]{10}$/);
  },

  buildRequests(validBidRequests, bidderRequest) {
    this.loadConfiguredData(validBidRequests[0]);
    this.propertyBag.buildRequestsStart = new Date().getTime();
    logInfo(`buildRequests time: ${this.propertyBag.buildRequestsStart} v ${NEWSPASSVERSION} validBidRequests`, JSON.parse(JSON.stringify(validBidRequests)), 'bidderRequest', JSON.parse(JSON.stringify(bidderRequest)));
    // First check - is there any config to block this request?
    if (this.blockTheRequest()) {
      return [];
    }
    let htmlParams = {'publisherId': '', 'siteId': ''};
    if (validBidRequests.length > 0) {
      this.cookieSyncBag.userIdObject = Object.assign(this.cookieSyncBag.userIdObject, this.findAllUserIds(validBidRequests[0]));
      this.cookieSyncBag.siteId = deepAccess(validBidRequests[0], 'params.siteId');
      this.cookieSyncBag.publisherId = deepAccess(validBidRequests[0], 'params.publisherId');
      htmlParams = validBidRequests[0].params;
    }
    logInfo('cookie sync bag', this.cookieSyncBag);
    let singleRequest = config.getConfig('newspassid.singleRequest');
    singleRequest = singleRequest !== false; // undefined & true will be true
    logInfo(`config newspassid.singleRequest : `, singleRequest);
    let npRequest = {}; // we only want to set specific properties on this, not validBidRequests[0].params

    // First party data module : look for ortb2 in setconfig & set the User object. NOTE THAT this should happen before we set the consentString
    // 20220630 - updated to be correct
    logInfo('going to get ortb2 from bidder request...');
    let fpd = deepAccess(bidderRequest, 'ortb2', null);
    logInfo('got fpd: ', fpd);
    if (fpd && deepAccess(fpd, 'user')) {
      logInfo('added FPD user object');
      npRequest.user = fpd.user;
    }
    const getParams = this.getGetParametersAsObject();
    const isTestMode = getParams['nptestmode'] || null; // this can be any string, it's used for testing ads
    npRequest.device = {'w': window.innerWidth, 'h': window.innerHeight};
    let placementIdOverrideFromGetParam = this.getPlacementIdOverrideFromGetParam(); // null or string
    // build the array of params to attach to `imp`
    let schain = null;
    let tosendtags = validBidRequests.map(npBidRequest => {
      var obj = {};
      let placementId = placementIdOverrideFromGetParam || this.getPlacementId(npBidRequest); // prefer to use a valid override param, else the bidRequest placement Id
      obj.id = npBidRequest.bidId; // this causes an error if we change it to something else, even if you update the bidRequest object: "WARNING: Bidder newspass made bid for unknown request ID: mb7953.859498327448. Ignoring."
      obj.tagid = placementId;
      let parsed = parseUrl(this.getRefererInfo().page);
      obj.secure = parsed.protocol === 'https' ? 1 : 0;
      // is there a banner (or nothing declared, so banner is the default)?
      let arrBannerSizes = [];
      if (!npBidRequest.hasOwnProperty('mediaTypes')) {
        if (npBidRequest.hasOwnProperty('sizes')) {
          logInfo('no mediaTypes detected - will use the sizes array in the config root');
          arrBannerSizes = npBidRequest.sizes;
        } else {
          logInfo('Cannot set sizes for banner type');
        }
      } else {
        if (npBidRequest.mediaTypes.hasOwnProperty(BANNER)) {
          arrBannerSizes = npBidRequest.mediaTypes[BANNER].sizes; /* Note - if there is a sizes element in the config root it will be pushed into here */
          logInfo('setting banner size from the mediaTypes.banner element for bidId ' + obj.id + ': ', arrBannerSizes);
        }
        // Native integration is not complete yet
        if (npBidRequest.mediaTypes.hasOwnProperty(NATIVE)) {
          obj.native = npBidRequest.mediaTypes[NATIVE];
          logInfo('setting native object from the mediaTypes.native element: ' + obj.id + ':', obj.native);
        }
      }
      if (arrBannerSizes.length > 0) {
        // build the banner request using banner sizes we found in either possible location:
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
      obj.placementId = placementId;
      // build the imp['ext'] object - NOTE - Dont obliterate anything that' already in obj.ext
      deepSetValue(obj, 'ext.prebid', {'storedrequest': {'id': placementId}});
      // obj.ext = {'prebid': {'storedrequest': {'id': placementId}}};
      obj.ext['newspassid'] = {};
      obj.ext['newspassid'].adUnitCode = npBidRequest.adUnitCode; // eg. 'mpu'
      obj.ext['newspassid'].transactionId = npBidRequest.transactionId; // this is the transactionId PER adUnit, common across bidders for this unit
      if (npBidRequest.params.hasOwnProperty('customData')) {
        obj.ext['newspassid'].customData = npBidRequest.params.customData;
      }
      logInfo(`obj.ext.newspassid is `, obj.ext['newspassid']);
      if (isTestMode != null) {
        logInfo('setting isTestMode to ', isTestMode);
        if (obj.ext['newspassid'].hasOwnProperty('customData')) {
          for (let i = 0; i < obj.ext['newspassid'].customData.length; i++) {
            obj.ext['newspassid'].customData[i]['targeting']['nptestmode'] = isTestMode;
          }
        } else {
          obj.ext['newspassid'].customData = [{'settings': {}, 'targeting': {}}];
          obj.ext['newspassid'].customData[0].targeting['nptestmode'] = isTestMode;
        }
      }
      if (fpd && deepAccess(fpd, 'site')) {
        // attach the site fpd into exactly : imp[n].ext.newspassid.customData.0.targeting
        logInfo('adding fpd.site');
        if (deepAccess(obj, 'ext.newspassid.customData.0.targeting', false)) {
          obj.ext.newspassid.customData[0].targeting = Object.assign(obj.ext.newspassid.customData[0].targeting, fpd.site);
        } else {
          deepSetValue(obj, 'ext.newspassid.customData.0.targeting', fpd.site);
        }
      }
      if (!schain && deepAccess(npBidRequest, 'schain')) {
        schain = npBidRequest.schain;
      }
      return obj;
    });

    // in v 2.0.0 we moved these outside of the individual ad slots
    let extObj = {};
    extObj['newspassid'] = {};
    extObj['newspassid']['np_pb_v'] = NEWSPASSVERSION;
    extObj['newspassid']['np_rw'] = placementIdOverrideFromGetParam ? 1 : 0;
    if (validBidRequests.length > 0) {
      let userIds = this.cookieSyncBag.userIdObject; // 2021-01-06 - slight optimisation - we've already found this info
      // let userIds = this.findAllUserIds(validBidRequests[0]);
      if (userIds.hasOwnProperty('pubcid')) {
        extObj['newspassid'].pubcid = userIds.pubcid;
      }
    }

    extObj['newspassid'].pv = this.getPageId(); // attach the page ID that will be common to all auction calls for this page if refresh() is called
    let whitelistAdserverKeys = config.getConfig('newspassid.np_whitelist_adserver_keys');
    let useWhitelistAdserverKeys = isArray(whitelistAdserverKeys) && whitelistAdserverKeys.length > 0;
    extObj['newspassid']['np_kvp_rw'] = useWhitelistAdserverKeys ? 1 : 0;
    // 20210413 - adding a set of GET params to pass to auction
    if (getParams.hasOwnProperty('npf')) { extObj['newspassid']['npf'] = getParams.npf === 'true' || getParams.npf === '1' ? 1 : 0; }
    if (getParams.hasOwnProperty('nppf')) { extObj['newspassid']['nppf'] = getParams.nppf === 'true' || getParams.nppf === '1' ? 1 : 0; }
    if (getParams.hasOwnProperty('nprp') && getParams.nprp.match(/^[0-3]$/)) { extObj['newspassid']['nprp'] = parseInt(getParams.nprp); }
    if (getParams.hasOwnProperty('npip') && getParams.npip.match(/^\d+$/)) { extObj['newspassid']['npip'] = parseInt(getParams.npip); }
    if (this.propertyBag.endpointOverride != null) { extObj['newspassid']['origin'] = this.propertyBag.endpointOverride; }

    // extObj.ortb2 = config.getConfig('ortb2'); // original test location
    // 20220628 - got rid of special treatment for adserver.org
    let userExtEids = deepAccess(validBidRequests, '0.userIdAsEids', []); // generate the UserIDs in the correct format for UserId module
    npRequest.site = {
      'publisher': {'id': htmlParams.publisherId},
      'page': this.getRefererInfo().page,
      'id': htmlParams.siteId
    };
    npRequest.test = config.getConfig('debug') ? 1 : 0;

    if (bidderRequest && bidderRequest.uspConsent) {
      logInfo('ADDING USP consent info');
      // 20220322 adding usp in the correct location https://docs.prebid.org/prebid-server/developers/add-new-bidder-go.html
      // 20220322 IAB correct location, changed from user.ext.uspConsent
      deepSetValue(npRequest, 'regs.ext.us_privacy', bidderRequest.uspConsent);
    } else {
      logInfo('WILL NOT ADD USP consent info; no bidderRequest.uspConsent.');
    }
    if (schain) { // we set this while iterating over the bids
      logInfo('schain found');
      deepSetValue(npRequest, 'source.ext.schain', schain);
    }

    // this is for 2.2.1
    // coppa compliance
    if (config.getConfig('coppa') === true) {
      deepSetValue(npRequest, 'regs.coppa', 1);
    }

    // 1.1.2 - add headers
    let options = {}
    // options.customHeaders = {
    //   'PBS_PUBLISHER_ID': this.cookieSyncBag.publisherId,
    //   'PBS_REFERRER_URL': this.getRefererInfo().page
    // }

    // return the single request object OR the array:
    if (singleRequest) {
      logInfo('buildRequests starting to generate response for a single request');
      npRequest.id = bidderRequest.auctionId; // Unique ID of the bid request, provided by the exchange.
      npRequest.auctionId = bidderRequest.auctionId; // not sure if this should be here?
      npRequest.imp = tosendtags;
      npRequest.ext = extObj;
      deepSetValue(npRequest, 'source.tid', bidderRequest.auctionId);// RTB 2.5 : tid is Transaction ID that must be common across all participants in this bid request (e.g., potentially multiple exchanges).
      deepSetValue(npRequest, 'user.ext.eids', userExtEids);
      var ret = {
        method: 'POST',
        url: this.getAuctionUrl(),
        data: JSON.stringify(npRequest),
        bidderRequest: bidderRequest,
        options
      };
      logInfo('buildRequests request data for single = ', JSON.parse(JSON.stringify(npRequest)));
      this.propertyBag.buildRequestsEnd = new Date().getTime();
      logInfo(`buildRequests going to return for single at time ${this.propertyBag.buildRequestsEnd} (took ${this.propertyBag.buildRequestsEnd - this.propertyBag.buildRequestsStart}ms): `, ret);
      return ret;
    }
    // not single request - pull apart the tosendtags array & return an array of objects each containing one element in the imp array.
    let arrRet = tosendtags.map(imp => {
      logInfo('buildRequests starting to generate non-single response, working on imp : ', imp);
      let npRequestSingle = Object.assign({}, npRequest);
      imp.ext['newspassid'].pageAuctionId = bidderRequest['auctionId']; // make a note in the ext object of what the original auctionId was, in the bidderRequest object
      npRequestSingle.id = imp.ext['newspassid'].transactionId; // Unique ID of the bid request, provided by the exchange.
      npRequestSingle.auctionId = imp.ext['newspassid'].transactionId; // not sure if this should be here?
      npRequestSingle.imp = [imp];
      npRequestSingle.ext = extObj;
      deepSetValue(npRequestSingle, 'source.tid', imp.ext['newspassid'].transactionId);// RTB 2.5 : tid is Transaction ID that must be common across all participants in this bid request (e.g., potentially multiple exchanges).
      // npRequestSingle.source = {'tid': imp.ext['newspassid'].transactionId};
      deepSetValue(npRequestSingle, 'user.ext.eids', userExtEids);
      logInfo('buildRequests RequestSingle (for non-single) = ', npRequestSingle);
      return {
        method: 'POST',
        url: this.getAuctionUrl(),
        data: JSON.stringify(npRequestSingle),
        bidderRequest: bidderRequest,
        options
      };
    });
    this.propertyBag.buildRequestsEnd = new Date().getTime();
    logInfo(`buildRequests going to return for non-single at time ${this.propertyBag.buildRequestsEnd} (took ${this.propertyBag.buildRequestsEnd - this.propertyBag.buildRequestsStart}ms): `, arrRet);
    return arrRet;
  },
  /**
   * Interpret the response if the array contains BIDDER elements, in the format: [ [bidder1 bid 1, bidder1 bid 2], [bidder2 bid 1, bidder2 bid 2] ]
   * NOte that in singleRequest mode this will be called once, else it will be called for each adSlot's response
   *
   * Updated April 2019 to return all bids, not just the one we decide is the 'winner'
   *
   * @param serverResponse
   * @param request
   * @returns {*}
   */
  interpretResponse(serverResponse, request) {
    if (request && request.bidderRequest && request.bidderRequest.bids) { this.loadConfiguredData(request.bidderRequest.bids[0]); }
    let startTime = new Date().getTime();
    logInfo(`interpretResponse time: ${startTime}. buildRequests done -> interpretResponse start was ${startTime - this.propertyBag.buildRequestsEnd}ms`);
    logInfo(`serverResponse, request`, JSON.parse(JSON.stringify(serverResponse)), JSON.parse(JSON.stringify(request)));
    serverResponse = serverResponse.body || {};
    // note that serverResponse.id value is the auction_id we might want to use for reporting reasons.
    if (!serverResponse.hasOwnProperty('seatbid')) {
      return [];
    }
    if (typeof serverResponse.seatbid !== 'object') {
      return [];
    }
    let arrAllBids = [];
    let enhancedAdserverTargeting = config.getConfig('newspassid.enhancedAdserverTargeting');
    logInfo('enhancedAdserverTargeting', enhancedAdserverTargeting);
    if (typeof enhancedAdserverTargeting == 'undefined') {
      enhancedAdserverTargeting = true;
    }
    logInfo('enhancedAdserverTargeting', enhancedAdserverTargeting);

    // 2021-03-05 - comment this out for a build without adding adid to the response
    serverResponse.seatbid = injectAdIdsIntoAllBidResponses(serverResponse.seatbid); // we now make sure that each bid in the bidresponse has a unique (within page) adId attribute.

    serverResponse.seatbid = this.removeSingleBidderMultipleBids(serverResponse.seatbid);
    let whitelistAdserverKeys = config.getConfig('newspassid.np_whitelist_adserver_keys');
    let useWhitelistAdserverKeys = isArray(whitelistAdserverKeys) && whitelistAdserverKeys.length > 0;

    for (let i = 0; i < serverResponse.seatbid.length; i++) {
      let sb = serverResponse.seatbid[i];
      for (let j = 0; j < sb.bid.length; j++) {
        let thisRequestBid = this.getBidRequestForBidId(sb.bid[j].impid, request.bidderRequest.bids);
        logInfo(`seatbid:${i}, bid:${j} Going to set default w h for seatbid/bidRequest`, sb.bid[j], thisRequestBid);
        const {defaultWidth, defaultHeight} = defaultSize(thisRequestBid);
        let thisBid = this.addStandardProperties(sb.bid[j], defaultWidth, defaultHeight);
        // prebid 4.0 compliance
        thisBid.meta = {advertiserDomains: thisBid.adomain || []};
        let bidType = deepAccess(thisBid, 'ext.prebid.type');
        logInfo(`this bid type is : ${bidType}`, j);
        let adserverTargeting = {};
        if (enhancedAdserverTargeting) {
          let allBidsForThisBidid = this.getAllBidsForBidId(thisBid.bidId, serverResponse.seatbid);
          // add all the winning & non-winning bids for this bidId:
          logInfo('Going to iterate allBidsForThisBidId', allBidsForThisBidid);
          Object.keys(allBidsForThisBidid).forEach((bidderName, index, ar2) => {
            logInfo(`adding adserverTargeting for ${bidderName} for bidId ${thisBid.bidId}`);
            // let bidderName = bidderNameWH.split('_')[0];
            adserverTargeting['np_' + bidderName] = bidderName;
            adserverTargeting['np_' + bidderName + '_crid'] = String(allBidsForThisBidid[bidderName].crid);
            adserverTargeting['np_' + bidderName + '_adv'] = String(allBidsForThisBidid[bidderName].adomain);
            adserverTargeting['np_' + bidderName + '_adId'] = String(allBidsForThisBidid[bidderName].adId);
            adserverTargeting['np_' + bidderName + '_pb_r'] = getRoundedBid(allBidsForThisBidid[bidderName].price, allBidsForThisBidid[bidderName].ext.prebid.type);
            if (allBidsForThisBidid[bidderName].hasOwnProperty('dealid')) {
              adserverTargeting['np_' + bidderName + '_dealid'] = String(allBidsForThisBidid[bidderName].dealid);
            }
          });
        } else {
          logInfo(`newspassid.enhancedAdserverTargeting is set to false, no per-bid keys will be sent to adserver.`);
        }
        // also add in the winning bid, to be sent to dfp
        let {seat: winningSeat, bid: winningBid} = this.getWinnerForRequestBid(thisBid.bidId, serverResponse.seatbid);
        adserverTargeting['np_auc_id'] = String(request.bidderRequest.auctionId);
        adserverTargeting['np_winner'] = String(winningSeat);
        adserverTargeting['np_bid'] = 'true';

        if (enhancedAdserverTargeting) {
          adserverTargeting['np_imp_id'] = String(winningBid.impid);
          adserverTargeting['np_pb_r'] = getRoundedBid(winningBid.price, bidType);
          adserverTargeting['np_adId'] = String(winningBid.adId);
          adserverTargeting['np_size'] = `${winningBid.width}x${winningBid.height}`;
        }
        if (useWhitelistAdserverKeys) { // delete any un-whitelisted keys
          logInfo('Going to filter out adserver targeting keys not in the whitelist: ', whitelistAdserverKeys);
          Object.keys(adserverTargeting).forEach(function(key) { if (whitelistAdserverKeys.indexOf(key) === -1) { delete adserverTargeting[key]; } });
        }
        thisBid.adserverTargeting = adserverTargeting;
        arrAllBids.push(thisBid);
      }
    }
    let endTime = new Date().getTime();
    logInfo(`interpretResponse going to return at time ${endTime} (took ${endTime - startTime}ms) Time from buildRequests Start -> interpretRequests End = ${endTime - this.propertyBag.buildRequestsStart}ms`, arrAllBids);
    return arrAllBids;
  },

  /**
   * If a bidder bids for > 1 size for an adslot, allow only the highest bid
   * @param seatbid object (serverResponse.seatbid)
   */
  removeSingleBidderMultipleBids(seatbid) {
    var ret = [];
    for (let i = 0; i < seatbid.length; i++) {
      let sb = seatbid[i];
      var retSeatbid = {'seat': sb.seat, 'bid': []};
      var bidIds = [];
      for (let j = 0; j < sb.bid.length; j++) {
        var candidate = sb.bid[j];
        if (contains(bidIds, candidate.impid)) {
          continue; // we've already fully assessed this impid, found the highest bid from this seat for it
        }
        bidIds.push(candidate.impid);
        for (let k = j + 1; k < sb.bid.length; k++) {
          if (sb.bid[k].impid === candidate.impid && sb.bid[k].price > candidate.price) {
            candidate = sb.bid[k];
          }
        }
        retSeatbid.bid.push(candidate);
      }
      ret.push(retSeatbid);
    }
    return ret;
  },
  // see http://prebid.org/dev-docs/bidder-adaptor.html#registering-user-syncs
  // us privacy: https://docs.prebid.org/dev-docs/modules/consentManagementUsp.html
  getUserSyncs(optionsType, serverResponse, gdprConsent, usPrivacy) {
    logInfo('getUserSyncs optionsType', optionsType, 'serverResponse', serverResponse, 'usPrivacy', usPrivacy, 'cookieSyncBag', this.cookieSyncBag);
    if (!serverResponse || serverResponse.length === 0) {
      return [];
    }
    if (optionsType.iframeEnabled) {
      var arrQueryString = [];
      if (config.getConfig('debug')) {
        arrQueryString.push('pbjs_debug=true');
      }
      arrQueryString.push('usp_consent=' + (usPrivacy || ''));
      // var objKeys = Object.getOwnPropertyNames(this.cookieSyncBag.userIdObject);
      // for (let idx in objKeys) {
      //   let keyname = objKeys[idx];
      //   arrQueryString.push(keyname + '=' + this.cookieSyncBag.userIdObject[keyname]);
      // }
      for (let keyname in this.cookieSyncBag.userIdObject) {
        arrQueryString.push(keyname + '=' + this.cookieSyncBag.userIdObject[keyname]);
      }
      arrQueryString.push('publisherId=' + this.cookieSyncBag.publisherId);
      arrQueryString.push('siteId=' + this.cookieSyncBag.siteId);
      arrQueryString.push('cb=' + Date.now());
      arrQueryString.push('bidder=' + this.propertyBag.config.bidder);

      var strQueryString = arrQueryString.join('&');
      if (strQueryString.length > 0) {
        strQueryString = '?' + strQueryString;
      }
      logInfo('getUserSyncs going to return cookie sync url : ' + this.getCookieSyncUrl() + strQueryString);
      return [{
        type: 'iframe',
        url: this.getCookieSyncUrl() + strQueryString
      }];
    }
  },
  /**
   * Find the bid matching the bidId in the request object
   * @return object|null
   */
  getBidRequestForBidId(bidId, arrBids) {
    for (let i = 0; i < arrBids.length; i++) {
      if (arrBids[i].bidId === bidId) { // bidId in the request comes back as impid in the seatbid bids
        return arrBids[i];
      }
    }
    return null;
  },
  /**
   * This is used for cookie sync, not auction call
   *  Look for pubcid & all the other IDs according to http://prebid.org/dev-docs/modules/userId.html
   *  @return map
   */
  findAllUserIds(bidRequest) {
    var ret = {};
    // it is not in the table 'Bidder Adapter Implementation' on https://docs.prebid.org/dev-docs/modules/userId.html#prebidjs-adapters
    let searchKeysSingle = ['pubcid', 'tdid', 'idl_env', 'criteoId', 'lotamePanoramaId', 'fabrickId'];
    if (bidRequest.hasOwnProperty('userId')) {
      for (let arrayId in searchKeysSingle) {
        let key = searchKeysSingle[arrayId];
        if (bidRequest.userId.hasOwnProperty(key)) {
          if (typeof (bidRequest.userId[key]) == 'string') {
            ret[key] = bidRequest.userId[key];
          } else if (typeof (bidRequest.userId[key]) == 'object') {
            logError(`WARNING: findAllUserIds had to use first key in user object to get value for bid.userId key: ${key}. Prebid adapter should be updated.`);
            // fallback - get the value of the first key in the object; this is NOT desirable behaviour
            ret[key] = bidRequest.userId[key][Object.keys(bidRequest.userId[key])[0]]; // cannot use Object.values
          } else {
            logError(`failed to get string key value for userId : ${key}`);
          }
        }
      }
      let lipbid = deepAccess(bidRequest.userId, 'lipb.lipbid');
      if (lipbid) {
        ret['lipb'] = {'lipbid': lipbid};
      }
      let id5id = deepAccess(bidRequest.userId, 'id5id.uid');
      if (id5id) {
        ret['id5id'] = id5id;
      }
      let parrableId = deepAccess(bidRequest.userId, 'parrableId.eid');
      if (parrableId) {
        ret['parrableId'] = parrableId;
      }
      let sharedid = deepAccess(bidRequest.userId, 'sharedid.id');
      if (sharedid) {
        ret['sharedid'] = sharedid;
      }
    }
    if (!ret.hasOwnProperty('pubcid')) {
      let pubcid = deepAccess(bidRequest, 'crumbs.pubcid');
      if (pubcid) {
        ret['pubcid'] = pubcid; // if built with old pubCommonId module
      }
    }
    return ret;
  },
  /**
   * Convenient method to get the value we need for the placementId - ONLY from the bidRequest - NOT taking into account any GET override ID
   * @param bidRequest
   * @return string
   */
  getPlacementId(bidRequest) {
    return (bidRequest.params.placementId).toString();
  },
  /**
   * IF the GET parameter npstoredrequest exists then it must validate for placementId correctly
   * IF there's a $_GET['npstoredrequest'] & it's valid then return this. Else return null.
   * @returns null|string
   */
  getPlacementIdOverrideFromGetParam() {
    let arr = this.getGetParametersAsObject();
    if (arr.hasOwnProperty('npstoredrequest')) {
      if (this.isValidPlacementId(arr['npstoredrequest'])) {
        logInfo(`using GET npstoredrequest ` + arr['npstoredrequest'] + ' to replace placementId');
        return arr['npstoredrequest'];
      } else {
        logError(`GET npstoredrequest FAILED VALIDATION - will not use it`);
      }
    }
    return null;
  },
  // Try to use this as the mechanism for reading GET params because it's easy to mock it for tests
  getGetParametersAsObject() {
    // let parsed = parseUrl(getRefererInfo().page);
    // logInfo('parsed', parsed);
    // let items = location.search.substr(1).split('&');
    // let ret = {};
    // let tmp = null;
    // for (let index = 0; index < items.length; index++) {
    //   tmp = items[index].split('=');
    //   ret[tmp[0]] = tmp[1];
    // }
    let parsed = parseUrl(this.getRefererInfo().location);
    logInfo('getGetParametersAsObject found:', parsed.search);
    return parsed.search;
  },
  /**
   * This is a wrapper for the src getRefererInfo function, allowing for prebid v6 or v7 to both be OK
   * We only use it for location and page, so the returned object will contain these 2 properties.
   * @return Object {location, page}
   */
  getRefererInfo() {
    if (getRefererInfo().hasOwnProperty('location')) {
      logInfo('FOUND location on getRefererInfo OK (prebid >= 7); will use getRefererInfo for location & page');
      return getRefererInfo();
    } else {
      logInfo('DID NOT FIND location on getRefererInfo (prebid < 7); will use legacy code that ALWAYS worked reliably to get location & page ;-)');
      try {
        return {
          page: top.location.href,
          location: top.location.href
        };
      } catch (e) {
        return {
          page: window.location.href,
          location: window.location.href
        };
      }
    }
  },
  /**
   * Do we have to block this request? Could be due to config values (no longer checking gdpr)
   * @return {boolean|*[]} true = block the request, else false
   */
  blockTheRequest() {
    // if there is an newspassid.np_request = false then quit now.
    let npRequest = config.getConfig('newspassid.np_request');
    if (typeof npRequest == 'boolean' && !npRequest) {
      logWarn(`Will not allow auction : np_request is set to false`);
      return true;
    }
    return false;
  },
  /**
   * This returns a random ID for this page. It starts off with the current ms timestamp then appends a random component
   * @return {string}
   */
  getPageId: function() {
    if (this.propertyBag.pageId == null) {
      let randPart = '';
      let allowable = '0123456789abcdefghijklmnopqrstuvwxyz';
      for (let i = 20; i > 0; i--) {
        randPart += allowable[Math.floor(Math.random() * 36)];
      }
      this.propertyBag.pageId = new Date().getTime() + '_' + randPart;
    }
    // NOTE this allows us to access the pv value outside of prebid after the auction request.
    // let storage = getStorageManager(this.gvlid, 'newspassid');
    // if (storage.localStorageIsEnabled()) {
    //   storage.setDataInLocalStorage('newspassid_pv', this.propertyBag.pageId);
    // }
    return this.propertyBag.pageId;
  },
  /**
   * We expect to be able to find a standard set of properties on winning bid objects; add them here.
   * @param seatBid
   * @param defaultWidth
   * @param defaultHeight
   * @return {*}
   */
  addStandardProperties(seatBid, defaultWidth, defaultHeight) {
    seatBid.cpm = seatBid.price;
    seatBid.bidId = seatBid.impid;
    seatBid.requestId = seatBid.impid;
    seatBid.width = seatBid.w || defaultWidth;
    seatBid.height = seatBid.h || defaultHeight;
    seatBid.ad = seatBid.adm;
    seatBid.netRevenue = true;
    seatBid.creativeId = seatBid.crid;
    seatBid.currency = 'USD';
    seatBid.ttl = 300;
    return seatBid;
  },
  /**
   * Do the messy searching for the best bid response in the serverResponse.seatbid array matching the requestBid.bidId
   * @param requestBidId
   * @param serverResponseSeatBid
   * @returns {*} bid object
   */
  getWinnerForRequestBid(requestBidId, serverResponseSeatBid) {
    let thisBidWinner = null;
    let winningSeat = null;
    for (let j = 0; j < serverResponseSeatBid.length; j++) {
      let theseBids = serverResponseSeatBid[j].bid;
      let thisSeat = serverResponseSeatBid[j].seat;
      for (let k = 0; k < theseBids.length; k++) {
        if (theseBids[k].impid === requestBidId) {
          // we've found a matching server response bid for this request bid
          if ((thisBidWinner == null) || (thisBidWinner.price < theseBids[k].price)) {
            thisBidWinner = theseBids[k];
            winningSeat = thisSeat;
            break;
          }
        }
      }
    }
    return {'seat': winningSeat, 'bid': thisBidWinner};
  },

  /**
   * Get a list of all the bids, for this bidId. The keys in the response object will be {seatname} OR {seatname}{w}x{h} if seatname already exists
   * @param matchBidId
   * @param serverResponseSeatBid
   * @returns {} = {newspassid|320x600:{obj}, newspassid|320x250:{obj}, appnexus|300x250:{obj}, ... }
   */
  getAllBidsForBidId(matchBidId, serverResponseSeatBid) {
    let objBids = {};
    for (let j = 0; j < serverResponseSeatBid.length; j++) {
      let theseBids = serverResponseSeatBid[j].bid;
      let thisSeat = serverResponseSeatBid[j].seat;
      for (let k = 0; k < theseBids.length; k++) {
        if (theseBids[k].impid === matchBidId) {
          if (objBids.hasOwnProperty(thisSeat)) { // > 1 bid for an adunit from a bidder - only use the one with the highest bid
            //   objBids[`${thisSeat}${theseBids[k].w}x${theseBids[k].h}`] = theseBids[k];
            if (objBids[thisSeat]['price'] < theseBids[k].price) {
              objBids[thisSeat] = theseBids[k];
            }
          } else {
            objBids[thisSeat] = theseBids[k];
          }
        }
      }
    }
    return objBids;
  }
};

/**
 * add a page-level-unique adId element to all server response bids.
 * NOTE that this is destructive - it mutates the serverResponse object sent in as a parameter
 * @param seatbid  object (serverResponse.seatbid)
 * @returns seatbid object
 */
export function injectAdIdsIntoAllBidResponses(seatbid) {
  logInfo('injectAdIdsIntoAllBidResponses', seatbid);
  for (let i = 0; i < seatbid.length; i++) {
    let sb = seatbid[i];
    for (let j = 0; j < sb.bid.length; j++) {
      // modify the bidId per-bid, so each bid has a unique adId within this response, and dfp can select one.
      // 2020-06 we now need a second level of ID because there might be multiple identical impid's within a seatbid!
      sb.bid[j]['adId'] = `${sb.bid[j]['impid']}-${i}-np-${j}`;
    }
  }
  return seatbid;
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
  if (!thebidObj) {
    logInfo('defaultSize received empty bid obj! going to return fixed default size');
    return {
      'defaultHeight': 250,
      'defaultWidth': 300
    };
  }
  const {sizes} = thebidObj;
  const returnObject = {};
  returnObject.defaultWidth = checkDeepArray(sizes)[0];
  returnObject.defaultHeight = checkDeepArray(sizes)[1];
  return returnObject;
}

/**
 * Round the bid price down according to the granularity
 * @param price
 * @param mediaType = banner or native
 */
export function getRoundedBid(price, mediaType) {
  const mediaTypeGranularity = config.getConfig(`mediaTypePriceGranularity.${mediaType}`); // might be string or object or nothing; if set then this takes precedence over 'priceGranularity'
  let objBuckets = config.getConfig('customPriceBucket'); // this is always an object - {} if strBuckets is not 'custom'
  let strBuckets = config.getConfig('priceGranularity'); // priceGranularity value, always a string ** if priceGranularity is set to an object then it's always 'custom' **
  let theConfigObject = getGranularityObject(mediaType, mediaTypeGranularity, strBuckets, objBuckets);
  let theConfigKey = getGranularityKeyName(mediaType, mediaTypeGranularity, strBuckets);

  logInfo('getRoundedBid. price:', price, 'mediaType:', mediaType, 'configkey:', theConfigKey, 'configObject:', theConfigObject, 'mediaTypeGranularity:', mediaTypeGranularity, 'strBuckets:', strBuckets);

  let priceStringsObj = getPriceBucketString(
    price,
    theConfigObject,
    config.getConfig('currency.granularityMultiplier')
  );
  logInfo('priceStringsObj', priceStringsObj);
  // by default, without any custom granularity set, you get granularity name : 'medium'
  let granularityNamePriceStringsKeyMapping = {
    'medium': 'med',
    'custom': 'custom',
    'high': 'high',
    'low': 'low',
    'dense': 'dense'
  };
  if (granularityNamePriceStringsKeyMapping.hasOwnProperty(theConfigKey)) {
    let priceStringsKey = granularityNamePriceStringsKeyMapping[theConfigKey];
    logInfo('getRoundedBid: looking for priceStringsKey:', priceStringsKey);
    return priceStringsObj[priceStringsKey];
  }
  return priceStringsObj['auto'];
}

/**
 * return the key to use to get the value out of the priceStrings object, taking into account anything at
 * config.priceGranularity level or config.mediaType.xxx level
 * I've noticed that the key specified by prebid core : config.getConfig('priceGranularity') does not properly
 * take into account the 2-levels of config
 */
export function getGranularityKeyName(mediaType, mediaTypeGranularity, strBuckets) {
  if (typeof mediaTypeGranularity === 'string') {
    return mediaTypeGranularity;
  }
  if (typeof mediaTypeGranularity === 'object') {
    return 'custom';
  }
  if (typeof strBuckets === 'string') {
    return strBuckets;
  }
  return 'auto'; // fall back to a default key - should literally never be needed.
}

/**
 * return the object to use to create the custom value of the priceStrings object, taking into account anything at
 * config.priceGranularity level or config.mediaType.xxx level
 */
export function getGranularityObject(mediaType, mediaTypeGranularity, strBuckets, objBuckets) {
  if (typeof mediaTypeGranularity === 'object') {
    return mediaTypeGranularity;
  }
  if (strBuckets === 'custom') {
    return objBuckets;
  }
  return '';
}

registerBidder(spec);
logInfo(`*BidAdapter ${NEWSPASSVERSION} was loaded`);
