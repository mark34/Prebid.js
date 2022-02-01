import { logInfo, logError, deepAccess, logWarn, deepSetValue, isArray, contains, isStr, mergeDeep } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, NATIVE, VIDEO } from '../src/mediaTypes.js';
import {config} from '../src/config.js';
import {getPriceBucketString} from '../src/cpmBucketManager.js';
import { Renderer } from '../src/Renderer.js';

// NOTE this allows us to access the pv value outside of prebid after the auction request.
// import { getStorageManager } from '../src/storageManager.js'

const BIDDER_CODE = 'newspass';
// --- START REMOVE FOR RELEASE

// To remove this : php removecomments.php

/*
GET parameters (20211022):
pbjs_debug=true
renderer=https%3A%2F%2Fwww.ardm.io%2Fozone%2Fvideo-testing%2Fprod%2Fhtml5-renderer%2Fozone-renderer-20210406-scroll-listener-noviewportfix.js
nppf (pass in adapter as 0 or 1 based on true/false or 0/1 being passed as the query parameter value)
nppf (pass in adapter as 0 or 1 based on true/false or 0/1 being passed as the query parameter value)
nprp (possible values: 0-3 / basically any integer which we just pass along)
npip (integer again as a value)
auction=dev
cookiesync=dev
 */

// NOTE THAT the gvl is available at https://iabeurope.eu/vendor-list-tcf-v2-0/

// testing fake endpoint for cookie sync new code with postMessage
// const NEWSPASSCOOKIESYNC = 'http://local.bussongs.com/prebid-cookie-sync-development.html';
// const NEWSPASSCOOKIESYNC = 'https://betalyst.local/prebid-cookie-sync-development.html';

// *** PROD ***
const ORIGIN = 'https://bidder.newspassid.com' // applies only to auction & cookie
const AUCTIONURI = '/openrtb2/auction';
const NEWSPASSCOOKIESYNC = '/static/load-cookie.html';
const NEWSPASS_RENDERER_URL = 'https://prebid.the-ozone-project.com/ozone-renderer.js';

// --- START REMOVE FOR RELEASE
// const AUCTIONURI = 'https://www.betalyst.com/test/20200622-auction-2-bids.php'; // fake auction response with 2 bids from the same bidder for an adslot
// const NEWSPASS_RENDERER_URL = 'https://www.betalyst.com/test/ozone-renderer-handle-refresh-via-gpt.js'; // video testing
// const NEWSPASS_RENDERER_URL = 'https://www.betalyst.com/test/ozone-renderer-handle-refresh-guardian20200602-with-gpt.js';
// const NEWSPASS_RENDERER_URL = 'https://www.betalyst.com/test/ozone-renderer-handle-refresh-guardian20200602-with-gpt-delay.php';
// const NEWSPASS_RENDERER_URL = 'http://localhost:9888/ozone-renderer-handle-refresh-via-gpt.js'; // video testing local
// const NEWSPASS_RENDERER_URL = 'http://localhost:9888/ozone-renderer-handle-refresh-guardian20200602-with-gpt.js'; // video testing local for guardian
// const NEWSPASS_RENDERER_URL = 'http://localhost:9888/ozone-renderer-switch.js'; // video testing local

// 20200605 - test js renderer
// const NEWSPASS_RENDERER_URL = 'https://www.ardm.io/ozone/2.2.0/testpages/test/ozone-renderer.js';
// --- END REMOVE FOR RELEASE
const NEWSPASSVERSION = '2.7.0';
export const spec = {
  version: NEWSPASSVERSION,
  code: BIDDER_CODE,
  supportedMediaTypes: [VIDEO, BANNER],
  cookieSyncBag: {publisherId: null, siteId: null, userIdObject: {}}, // variables we want to make available to cookie sync
  propertyBag: {config: null, pageId: null, buildRequestsStart: 0, buildRequestsEnd: 0, endpointOverride: null}, /* allow us to store vars in instance scope - needs to be an object to be mutable */
  config_defaults: {
    'logId': 'NEWSPASS',
    'bidder': 'newspass',
    'keyPrefix': 'np',
    'auctionUrl': ORIGIN + AUCTIONURI,
    'cookieSyncUrl': ORIGIN + NEWSPASSCOOKIESYNC,
    'rendererUrl': NEWSPASS_RENDERER_URL
  },
  /**
   * make sure that the whitelabel/default values are available in the propertyBag
   * @param bid Object : the bid
   */
  loadConfiguredData(bid) {
    if (this.propertyBag.config) { return; }
    this.propertyBag.config = JSON.parse(JSON.stringify(this.config_defaults));
    let bidder = bid.bidder || 'newspass';
    this.propertyBag.config.logId = bidder.toUpperCase();
    this.propertyBag.config.bidder = bidder;
    let bidderConfig = config.getConfig(bidder) || {};
    logInfo('got bidderConfig: ', JSON.parse(JSON.stringify(bidderConfig)));
    if (bidderConfig.kvpPrefix) {
      this.propertyBag.config.keyPrefix = bidderConfig.kvpPrefix;
    }
    let arrGetParams = this.getGetParametersAsObject();
    if (bidderConfig.endpointOverride) {
      if (bidderConfig.endpointOverride.origin) {
        this.propertyBag.endpointOverride = bidderConfig.endpointOverride.origin;
        this.propertyBag.config.auctionUrl = bidderConfig.endpointOverride.origin + AUCTIONURI;
        this.propertyBag.config.cookieSyncUrl = bidderConfig.endpointOverride.origin + NEWSPASSCOOKIESYNC;
      }
      if (arrGetParams.hasOwnProperty('renderer')) {
        if (arrGetParams.renderer.match('%3A%2F%2F')) {
          this.propertyBag.config.rendererUrl = decodeURIComponent(arrGetParams['renderer']);
        } else {
          this.propertyBag.config.rendererUrl = arrGetParams['renderer'];
        }
      } else if (bidderConfig.endpointOverride.rendererUrl) {
        this.propertyBag.config.rendererUrl = bidderConfig.endpointOverride.rendererUrl;
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
  getRendererUrl() {
    return this.propertyBag.config.rendererUrl;
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
    if (bid.hasOwnProperty('mediaTypes') && bid.mediaTypes.hasOwnProperty(VIDEO)) {
      if (!bid.mediaTypes[VIDEO].hasOwnProperty('context')) {
        logError('No video context key/value in bid. Rejecting bid: ', bid);
        return false;
      }
      if (bid.mediaTypes[VIDEO].context !== 'instream' && bid.mediaTypes[VIDEO].context !== 'outstream') {
        logError('video.context is invalid. Only instream/outstream video is supported. Rejecting bid: ', bid);
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
    let singleRequest = config.getConfig('newspass.singleRequest');
    singleRequest = singleRequest !== false; // undefined & true will be true
    logInfo(`config newspass.singleRequest : `, singleRequest);
    let npRequest = {}; // we only want to set specific properties on this, not validBidRequests[0].params
    delete npRequest.test; // don't allow test to be set in the config - ONLY use $_GET['pbjs_debug']

    // First party data module : look for ortb2 in setconfig & set the User object. NOTE THAT this should happen before we set the consentString
    let fpd = config.getConfig('ortb2');
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
      obj.id = npBidRequest.bidId; // this causes an error if we change it to something else, even if you update the bidRequest object: "WARNING: Bidder ozone made bid for unknown request ID: mb7953.859498327448. Ignoring."
      obj.tagid = placementId;
      obj.secure = window.location.protocol === 'https:' ? 1 : 0;
      // is there a banner (or nothing declared, so banner is the default)?
      let arrBannerSizes = [];
      if (!npBidRequest.hasOwnProperty('mediaTypes')) {
        if (npBidRequest.hasOwnProperty('sizes')) {
          logInfo('no mediaTypes detected - will use the sizes array in the config root');
          arrBannerSizes = npBidRequest.sizes;
        } else {
          logInfo('no mediaTypes detected, no sizes array in the config root either. Cannot set sizes for banner type');
        }
      } else {
        if (npBidRequest.mediaTypes.hasOwnProperty(BANNER)) {
          arrBannerSizes = npBidRequest.mediaTypes[BANNER].sizes; /* Note - if there is a sizes element in the config root it will be pushed into here */
          logInfo('setting banner size from the mediaTypes.banner element for bidId ' + obj.id + ': ', arrBannerSizes);
        }
        if (npBidRequest.mediaTypes.hasOwnProperty(VIDEO)) {
          logInfo('openrtb 2.5 compliant video');
          // examine all the video attributes in the config, and either put them into obj.video if allowed by IAB2.5 or else in to obj.video.ext
          if (typeof npBidRequest.mediaTypes[VIDEO] == 'object') {
            let childConfig = deepAccess(npBidRequest, 'params.video', {});
            obj.video = this.unpackVideoConfigIntoIABformat(npBidRequest.mediaTypes[VIDEO], childConfig);
            obj.video = this.addVideoDefaults(obj.video, npBidRequest.mediaTypes[VIDEO], childConfig);
          }
          // we need to duplicate some of the video values
          let wh = getWidthAndHeightFromVideoObject(obj.video);
          logInfo('setting video object from the mediaTypes.video element: ' + obj.id + ':', obj.video, 'wh=', wh);
          if (wh && typeof wh === 'object') {
            obj.video.w = wh['w'];
            obj.video.h = wh['h'];
            if (playerSizeIsNestedArray(obj.video)) { // this should never happen; it was in the original spec for this change though.
              logInfo('setting obj.video.format to be an array of objects');
              obj.video.ext.format = [wh];
            } else {
              logInfo('setting obj.video.format to be an object');
              obj.video.ext.format = wh;
            }
          } else {
            logWarn('cannot set w, h & format values for video; the config is not right');
          }
        }
        // Native integration is not complete yet
        if (npBidRequest.mediaTypes.hasOwnProperty(NATIVE)) {
          obj.native = npBidRequest.mediaTypes[NATIVE];
          logInfo('setting native object from the mediaTypes.native element: ' + obj.id + ':', obj.native);
        }
        // is the publisher specifying floors, and is the floors module enabled?
        if (npBidRequest.hasOwnProperty('getFloor')) {
          logInfo('This bidRequest object has property: getFloor');
          obj.floor = this.getFloorObjectForAuction(npBidRequest);
          logInfo('obj.floor is : ', obj.floor);
        } else {
          logInfo('This bidRequest object DOES NOT have property: getFloor');
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
      obj.ext['newspass'] = {};
      obj.ext['newspass'].adUnitCode = npBidRequest.adUnitCode; // eg. 'mpu'
      obj.ext['newspass'].transactionId = npBidRequest.transactionId; // this is the transactionId PER adUnit, common across bidders for this unit
      if (npBidRequest.params.hasOwnProperty('customData')) {
        obj.ext['newspass'].customData = npBidRequest.params.customData;
      }
      logInfo(`obj.ext.newspass is `, obj.ext['newspass']);
      if (isTestMode != null) {
        logInfo('setting isTestMode to ', isTestMode);
        if (obj.ext['newspass'].hasOwnProperty('customData')) {
          for (let i = 0; i < obj.ext['newspass'].customData.length; i++) {
            obj.ext['newspass'].customData[i]['targeting']['nptestmode'] = isTestMode;
          }
        } else {
          obj.ext['newspass'].customData = [{'settings': {}, 'targeting': {}}];
          obj.ext['newspass'].customData[0].targeting['nptestmode'] = isTestMode;
        }
      }
      if (fpd && deepAccess(fpd, 'site')) {
        // attach the site fpd into exactly : imp[n].ext.[whitelabel].customData.0.targeting
        logInfo('added fpd.site');
        if (deepAccess(obj, 'ext.newspass.customData.0.targeting', false)) {
          obj.ext['newspass'].customData[0].targeting = Object.assign(obj.ext['newspass'].customData[0].targeting, fpd.site);
          // let keys = getKeys(fpd.site);
          // for (let i = 0; i < keys.length; i++) {
          //   obj.ext['newspass'].customData[0].targeting[keys[i]] = fpd.site[keys[i]];
          // }
        } else {
          deepSetValue(obj, 'ext.newspass.customData.0.targeting', fpd.site);
        }
      }
      if (!schain && deepAccess(npBidRequest, 'schain')) {
        schain = npBidRequest.schain;
      }
      return obj;
    });

    // in v 2.0.0 we moved these outside of the individual ad slots
    let extObj = {};
    extObj['newspass'] = {};
    extObj['newspass']['np_pb_v'] = NEWSPASSVERSION;
    extObj['newspass']['np_rw'] = placementIdOverrideFromGetParam ? 1 : 0;
    if (validBidRequests.length > 0) {
      let userIds = this.cookieSyncBag.userIdObject; // 2021-01-06 - slight optimisation - we've already found this info
      // let userIds = this.findAllUserIds(validBidRequests[0]);
      if (userIds.hasOwnProperty('pubcid')) {
        extObj['newspass'].pubcid = userIds.pubcid;
      }
    }

    extObj['newspass'].pv = this.getPageId(); // attach the page ID that will be common to all auciton calls for this page if refresh() is called
    let npOmpFloorDollars = config.getConfig('newspass.np_omp_floor'); // valid only if a dollar value (typeof == 'number')
    logInfo(`np_omp_floor dollar value = `, npOmpFloorDollars);
    if (typeof npOmpFloorDollars === 'number') {
      extObj['newspass']['np_omp_floor'] = npOmpFloorDollars;
    } else if (typeof npOmpFloorDollars !== 'undefined') {
      logError(`np_omp_floor is invalid - IF SET then this must be a number, representing dollar value eg. np_omp_floor: 1.55. You have it set as a ` + (typeof npOmpFloorDollars));
    }
    let whitelistAdserverKeys = config.getConfig('newspass.np_whitelist_adserver_keys');
    let useWhitelistAdserverKeys = isArray(whitelistAdserverKeys) && whitelistAdserverKeys.length > 0;
    extObj['newspass']['np_kvp_rw'] = useWhitelistAdserverKeys ? 1 : 0;
    // 20210413 - adding a set of GET params to pass to auction
    if (getParams.hasOwnProperty('npf')) { extObj['newspass']['npf'] = getParams.npf === 'true' || getParams.npf === '1' ? 1 : 0; }
    if (getParams.hasOwnProperty('nppf')) { extObj['newspass']['nppf'] = getParams.nppf === 'true' || getParams.nppf === '1' ? 1 : 0; }
    if (getParams.hasOwnProperty('nprp') && getParams.nprp.match(/^[0-3]$/)) { extObj['newspass']['nprp'] = parseInt(getParams.nprp); }
    if (getParams.hasOwnProperty('npip') && getParams.npip.match(/^\d+$/)) { extObj['newspass']['npip'] = parseInt(getParams.npip); }
    if (this.propertyBag.endpointOverride != null) { extObj['newspass']['origin'] = this.propertyBag.endpointOverride; }

    // extObj.ortb2 = config.getConfig('ortb2'); // original test location
    var userExtEids = this.generateEids(validBidRequests); // generate the UserIDs in the correct format for UserId module

    npRequest.site = {
      'publisher': {'id': htmlParams.publisherId},
      'page': document.location.href,
      'id': htmlParams.siteId
    };
    npRequest.test = (getParams.hasOwnProperty('pbjs_debug') && getParams['pbjs_debug'] === 'true') ? 1 : 0;

    if (bidderRequest && bidderRequest.uspConsent) {
      logInfo('ADDING CCPA info');
      deepSetValue(npRequest, 'user.ext.uspConsent', bidderRequest.uspConsent);
    } else {
      logInfo('WILL NOT ADD CCPA info; no bidderRequest.uspConsent.');
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
        bidderRequest: bidderRequest
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
      imp.ext['newspass'].pageAuctionId = bidderRequest['auctionId']; // make a note in the ext object of what the original auctionId was, in the bidderRequest object
      npRequestSingle.id = imp.ext['newspass'].transactionId; // Unique ID of the bid request, provided by the exchange.
      npRequestSingle.auctionId = imp.ext['newspass'].transactionId; // not sure if this should be here?
      npRequestSingle.imp = [imp];
      npRequestSingle.ext = extObj;
      deepSetValue(npRequestSingle, 'source.tid', imp.ext['newspass'].transactionId);// RTB 2.5 : tid is Transaction ID that must be common across all participants in this bid request (e.g., potentially multiple exchanges).
      // npRequestSingle.source = {'tid': imp.ext['newspass'].transactionId};
      deepSetValue(npRequestSingle, 'user.ext.eids', userExtEids);
      logInfo('buildRequests RequestSingle (for non-single) = ', npRequestSingle);
      return {
        method: 'POST',
        url: this.getAuctionUrl(),
        data: JSON.stringify(npRequestSingle),
        bidderRequest: bidderRequest
      };
    });
    this.propertyBag.buildRequestsEnd = new Date().getTime();
    logInfo(`buildRequests going to return for non-single at time ${this.propertyBag.buildRequestsEnd} (took ${this.propertyBag.buildRequestsEnd - this.propertyBag.buildRequestsStart}ms): `, arrRet);
    return arrRet;
  },
  /**
   * parse a bidRequestRef that contains getFloor(), get all the data from it for the sizes & media requested for this bid & return an object containing floor data you can send to auciton endpoint
   * @param bidRequestRef object = a valid bid request object reference
   * @return object
   *
   * call:
   * bidObj.getFloor({
      currency: 'USD', <- currency to return the value in
      mediaType: ‘banner’,
      size: ‘*’ <- or [300,250] or [[300,250],[640,480]]
   * });
   *
   */
  getFloorObjectForAuction(bidRequestRef) {
    const mediaTypesSizes = {
      banner: deepAccess(bidRequestRef, 'mediaTypes.banner.sizes', null),
      video: deepAccess(bidRequestRef, 'mediaTypes.video.playerSize', null),
      native: deepAccess(bidRequestRef, 'mediaTypes.native.image.sizes', null)
    }
    logInfo('getFloorObjectForAuction mediaTypesSizes : ', mediaTypesSizes);
    let ret = {};
    if (mediaTypesSizes.banner) {
      ret.banner = bidRequestRef.getFloor({mediaType: 'banner', currency: 'USD', size: mediaTypesSizes.banner});
    }
    if (mediaTypesSizes.video) {
      ret.video = bidRequestRef.getFloor({mediaType: 'video', currency: 'USD', size: mediaTypesSizes.video});
    }
    if (mediaTypesSizes.native) {
      ret.native = bidRequestRef.getFloor({mediaType: 'native', currency: 'USD', size: mediaTypesSizes.native});
    }
    logInfo('getFloorObjectForAuction returning : ', JSON.parse(JSON.stringify(ret)));
    return ret;
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
    logInfo(`interpretResponse time: ${startTime} . Time between buildRequests done and interpretResponse start was ${startTime - this.propertyBag.buildRequestsEnd}ms`);
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
    let enhancedAdserverTargeting = config.getConfig('newspass.enhancedAdserverTargeting');
    logInfo('enhancedAdserverTargeting', enhancedAdserverTargeting);
    if (typeof enhancedAdserverTargeting == 'undefined') {
      enhancedAdserverTargeting = true;
    }
    logInfo('enhancedAdserverTargeting', enhancedAdserverTargeting);

    // 2021-03-05 - comment this out for a build without adding adid to the response
    serverResponse.seatbid = injectAdIdsIntoAllBidResponses(serverResponse.seatbid); // we now make sure that each bid in the bidresponse has a unique (within page) adId attribute.

    serverResponse.seatbid = this.removeSingleBidderMultipleBids(serverResponse.seatbid);
    let npOmpFloorDollars = config.getConfig('newspass.np_omp_floor'); // valid only if a dollar value (typeof == 'number')
    let addOzOmpFloorDollars = typeof npOmpFloorDollars === 'number';
    let whitelistAdserverKeys = config.getConfig('newspass.np_whitelist_adserver_keys');
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
        let videoContext = null;
        let isVideo = false;
        let bidType = deepAccess(thisBid, 'ext.prebid.type');
        logInfo(`this bid type is : ${bidType}`, j);
        if (bidType === VIDEO) {
          isVideo = true;
          videoContext = this.getVideoContextForBidId(thisBid.bidId, request.bidderRequest.bids); // should be instream or outstream (or null if error)
          if (videoContext === 'outstream') {
            logInfo('going to attach a renderer to OUTSTREAM video : ', j);
            thisBid.renderer = newRenderer(thisBid.bidId);
          } else {
            logInfo('bid is not an outstream video, will not attach a renderer: ', j);
          }
        }
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
            if (addOzOmpFloorDollars) {
              adserverTargeting['np_' + bidderName + '_omp'] = allBidsForThisBidid[bidderName].price >= npOmpFloorDollars ? '1' : '0';
            }
            if (isVideo) {
              adserverTargeting['np_' + bidderName + '_vid'] = videoContext; // outstream or instream
            }
            let flr = deepAccess(allBidsForThisBidid[bidderName], `ext.bidder.newspass.floor`, null);
            if (flr != null) {
              adserverTargeting['np_' + bidderName + '_flr'] = flr;
            }
            let rid = deepAccess(allBidsForThisBidid[bidderName], `ext.bidder.newspass.ruleId`, null);
            if (rid != null) {
              adserverTargeting['np_' + bidderName + '_rid'] = rid;
            }
            if (bidderName.match(/^ozappnexus/)) {
              adserverTargeting['np_' + bidderName + '_sid'] = String(allBidsForThisBidid[bidderName].cid);
            }
          });
        } else {
          if (useWhitelistAdserverKeys) {
            logWarn(`You have set a whitelist of adserver keys but this will be ignored because newspass.enhancedAdserverTargeting is set to false. No per-bid keys will be sent to adserver.`);
          } else {
            logInfo(`newspass.enhancedAdserverTargeting is set to false, so no per-bid keys will be sent to adserver.`);
          }
        }
        // also add in the winning bid, to be sent to dfp
        let {seat: winningSeat, bid: winningBid} = this.getWinnerForRequestBid(thisBid.bidId, serverResponse.seatbid);
        adserverTargeting['np_auc_id'] = String(request.bidderRequest.auctionId);
        adserverTargeting['np_winner'] = String(winningSeat);
        adserverTargeting['np_bid'] = 'true';

        if (enhancedAdserverTargeting) {
          adserverTargeting['np_imp_id'] = String(winningBid.impid);
          adserverTargeting['np_pb_v'] = NEWSPASSVERSION;
          adserverTargeting['np_pb'] = winningBid.price;
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
    logInfo('getUserSyncs optionsType', optionsType, 'serverResponse', serverResponse, 'gdprConsent', gdprConsent, 'usPrivacy', usPrivacy, 'cookieSyncBag', this.cookieSyncBag);
    if (!serverResponse || serverResponse.length === 0) {
      return [];
    }
    if (optionsType.iframeEnabled) {
      var arrQueryString = [];
      if (document.location.search.match(/pbjs_debug=true/)) {
        arrQueryString.push('pbjs_debug=true');
      }
      arrQueryString.push('gdpr=' + (deepAccess(gdprConsent, 'gdprApplies', false) ? '1' : '0'));
      arrQueryString.push('gdpr_consent=' + deepAccess(gdprConsent, 'consentString', ''));
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
   * get instream or outstream if this was a video request else null
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
   * Locate the bid inside the arrBids for this bidId, then discover the video context, and return it.
   * IF the bid cannot be found return null, else return a string.
   * @param bidId
   * @param arrBids
   * @return string|null
   */
  getVideoContextForBidId(bidId, arrBids) {
    let requestBid = this.getBidRequestForBidId(bidId, arrBids);
    if (requestBid != null) {
      return deepAccess(requestBid, 'mediaTypes.video.context', 'unknown')
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
      let sharedidthird = deepAccess(bidRequest.userId, 'sharedid.third');
      if (sharedidthird) {
        ret['sharedidthird'] = sharedidthird;
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
   * GET parameter introduced in 2.2.0 : ozstoredrequest
   * IF the GET parameter exists then it must validate for placementId correctly
   * IF there's a $_GET['ozstoredrequest'] & it's valid then return this. Else return null.
   * @returns null|string
   */
  getPlacementIdOverrideFromGetParam() {
    let arr = this.getGetParametersAsObject();
    if (arr.hasOwnProperty('npstoredrequest')) {
      if (this.isValidPlacementId(arr['npstoredrequest'])) {
        logInfo(`using GET ${'np'}storedrequest ` + arr['npstoredrequest'] + ' to replace placementId');
        return arr['npstoredrequest'];
      } else {
        logError(`GET npstoredrequest FAILED VALIDATION - will not use it`);
      }
    }
    return null;
  },
  /**
   * Generate an object we can append to the auction request, containing user data formatted correctly for different ssps
   * http://prebid.org/dev-docs/modules/userId.html
   * @param validBidRequests
   * @return {Array}
   */
  generateEids(validBidRequests) {
    let eids;
    const bidRequest = validBidRequests[0];
    if (bidRequest && bidRequest.userId) {
      eids = bidRequest.userIdAsEids;
      this.handleTTDId(eids, validBidRequests);
    }
    return eids;
  },
  handleTTDId(eids, validBidRequests) {
    let ttdId = null;
    let adsrvrOrgId = config.getConfig('adsrvrOrgId');
    if (isStr(deepAccess(validBidRequests, '0.userId.tdid'))) {
      ttdId = validBidRequests[0].userId.tdid;
    } else if (adsrvrOrgId && isStr(adsrvrOrgId.TDID)) {
      ttdId = adsrvrOrgId.TDID;
    }
    if (ttdId !== null) {
      eids.push({
        'source': 'adserver.org',
        'uids': [{
          'id': ttdId,
          'atype': 1,
          'ext': {
            'rtiPartner': 'TDID'
          }
        }]
      });
    }
  },
  // Try to use this as the mechanism for reading GET params because it's easy to mock it for tests
  getGetParametersAsObject() {
    let items = location.search.substr(1).split('&');
    let ret = {};
    let tmp = null;
    for (let index = 0; index < items.length; index++) {
      tmp = items[index].split('=');
      ret[tmp[0]] = tmp[1];
    }
    return ret;
  },
  /**
   * Do we have to block this request? Could be due to config values (no longer checking gdpr)
   * @return {boolean|*[]} true = block the request, else false
   */
  blockTheRequest() {
    // if there is an newspass.np_request = false then quit now.
    let ozRequest = config.getConfig('newspass.np_request');
    if (typeof ozRequest == 'boolean' && !ozRequest) {
      logWarn(`Will not allow auction : ${this.propertyBag.config.keyPrefix}one.${this.propertyBag.config.keyPrefix}_request is set to false`);
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
    // let storage = getStorageManager(this.gvlid, 'newspass');
    // if (storage.localStorageIsEnabled()) {
    //   storage.setDataInLocalStorage('newspass_pv', this.propertyBag.pageId);
    // }
    return this.propertyBag.pageId;
  },
  unpackVideoConfigIntoIABformat(videoConfig, childConfig) {
    let ret = {'ext': {}};
    ret = this._unpackVideoConfigIntoIABformat(ret, videoConfig);
    ret = this._unpackVideoConfigIntoIABformat(ret, childConfig);
    return ret;
  },
  /**
   *
   * look in ONE object to get video config (we need to call this multiple times, so child settings override parent)
   * @param ret
   * @param objConfig
   * @return {*}
   * @private
   */
  _unpackVideoConfigIntoIABformat(ret, objConfig) {
    let arrVideoKeysAllowed = ['mimes', 'minduration', 'maxduration', 'protocols', 'w', 'h', 'startdelay', 'placement', 'linearity', 'skip', 'skipmin', 'skipafter', 'sequence', 'battr', 'maxextended', 'minbitrate', 'maxbitrate', 'boxingallowed', 'playbackmethod', 'playbackend', 'delivery', 'pos', 'companionad', 'api', 'companiontype'];
    for (const key in objConfig) {
      var found = false;
      arrVideoKeysAllowed.forEach(function(arg) {
        if (arg === key) {
          ret[key] = objConfig[key];
          found = true;
        }
      });
      if (!found) {
        ret.ext[key] = objConfig[key];
      }
    }
    // handle ext separately, if it exists; we have probably built up an ext object already
    if (objConfig.hasOwnProperty('ext') && typeof objConfig.ext === 'object') {
      if (objConfig.hasOwnProperty('ext')) {
        ret.ext = mergeDeep(ret.ext, objConfig.ext);
      } else {
        ret.ext = objConfig.ext;
      }
    }
    return ret;
  },
  addVideoDefaults(objRet, videoConfig, childConfig) {
    objRet = this._addVideoDefaults(objRet, videoConfig, false);
    objRet = this._addVideoDefaults(objRet, childConfig, true); // child config will override parent config
    return objRet;
  },
  /**
   * modify objRet, adding in default values
   * @param objRet
   * @param objConfig
   * @param addIfMissing
   * @return {*}
   * @private
   */
  _addVideoDefaults(objRet, objConfig, addIfMissing) {
    // add inferred values & any default values we want.
    let context = deepAccess(objConfig, 'context');
    if (context === 'outstream') {
      objRet.placement = 3;
    } else if (context === 'instream') {
      objRet.placement = 1;
    }
    let skippable = deepAccess(objConfig, 'skippable', null);
    if (skippable == null) {
      if (addIfMissing && !objRet.hasOwnProperty('skip')) {
        objRet.skip = skippable ? 1 : 0;
      }
    } else {
      objRet.skip = skippable ? 1 : 0;
    }
    return objRet;
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
   * @returns {} = {newspass|320x600:{obj}, newspass|320x250:{obj}, appnexus|300x250:{obj}, ... }
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
      sb.bid[j]['adId'] = `${sb.bid[j]['impid']}-${i}-${spec.propertyBag.config.keyPrefix}-${j}`;
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
 * @param mediaType = video, banner or native
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

/**
 *
 * @param objVideo will be like {"playerSize":[640,480],"mimes":["video/mp4"],"context":"outstream"} or POSSIBLY {"playerSize":[[640,480]],"mimes":["video/mp4"],"context":"outstream"}
 * @return object {w,h} or null
 */
export function getWidthAndHeightFromVideoObject(objVideo) {
  let playerSize = getPlayerSizeFromObject(objVideo);
  if (!playerSize) {
    return null;
  }
  if (playerSize[0] && typeof playerSize[0] === 'object') {
    logInfo('getWidthAndHeightFromVideoObject found nested array inside playerSize.', playerSize[0]);
    playerSize = playerSize[0];
    if (typeof playerSize[0] !== 'number' && typeof playerSize[0] !== 'string') {
      logInfo('getWidthAndHeightFromVideoObject found non-number/string type inside the INNER array in playerSize. This is totally wrong - cannot continue.', playerSize[0]);
      return null;
    }
  }
  if (playerSize.length !== 2) {
    logInfo('getWidthAndHeightFromVideoObject found playerSize with length of ' + playerSize.length + '. This is totally wrong - cannot continue.');
    return null;
  }
  return ({'w': playerSize[0], 'h': playerSize[1]});
}

/**
 * @param objVideo will be like {"playerSize":[640,480],"mimes":["video/mp4"],"context":"outstream"} or POSSIBLY {"playerSize":[[640,480]],"mimes":["video/mp4"],"context":"outstream"}
 * @return object {w,h} or null
 */
export function playerSizeIsNestedArray(objVideo) {
  let playerSize = getPlayerSizeFromObject(objVideo);
  if (!playerSize) {
    return null;
  }
  if (playerSize.length < 1) {
    return null;
  }
  return (playerSize[0] && typeof playerSize[0] === 'object');
}

/**
 * Common functionality when looking at a video object, to get the playerSize
 * @param objVideo
 * @returns {*}
 */
function getPlayerSizeFromObject(objVideo) {
  logInfo('getPlayerSizeFromObject received object', objVideo);
  let playerSize = deepAccess(objVideo, 'playerSize');
  if (!playerSize) {
    playerSize = deepAccess(objVideo, 'ext.playerSize');
  }
  if (!playerSize) {
    logError('getPlayerSizeFromObject FAILED: no playerSize in video object or ext', objVideo);
    return null;
  }
  if (typeof playerSize !== 'object') {
    logError('getPlayerSizeFromObject FAILED: playerSize is not an object/array', objVideo);
    return null;
  }
  return playerSize;
}
/*
  Rendering video ads - create a renderer instance, mark it as not loaded, set a renderer function.
  The renderer function will not assume that the renderer script is loaded - it will push() the ultimate render function call
 */
function newRenderer(adUnitCode, rendererOptions = {}) {
  let isLoaded = window.ozoneVideo;
  logInfo(`newRenderer going to set loaded to ${isLoaded ? 'true' : 'false'}`);
  const renderer = Renderer.install({
    url: spec.getRendererUrl(),
    config: rendererOptions,
    loaded: isLoaded,
    adUnitCode
  });
  try {
    renderer.setRender(outstreamRender);
  } catch (err) {
    logError('Prebid Error when calling setRender on renderer', JSON.parse(JSON.stringify(renderer)), err);
  }
  return renderer;
}
function outstreamRender(bid) {
  logInfo('outstreamRender called. Going to push the call to window.ozoneVideo.outstreamRender(bid) bid =', JSON.parse(JSON.stringify(bid)));
  // push to render queue because ozoneVideo may not be loaded yet
  bid.renderer.push(() => {
    window.ozoneVideo.outstreamRender(bid);
  });
}

registerBidder(spec);
logInfo(`*BidAdapter ${NEWSPASSVERSION} was loaded`);
