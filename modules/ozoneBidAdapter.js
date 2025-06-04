import {
  logInfo,
  logError,
  deepAccess,
  logWarn,
  deepSetValue,
  isArray,
  contains,
  mergeDeep,
  parseUrl,
  generateUUID, isInteger, deepClone, getBidIdParameter
} from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, NATIVE, VIDEO } from '../src/mediaTypes.js';
import {config} from '../src/config.js';
import {getPriceBucketString} from '../src/cpmBucketManager.js';
import { Renderer } from '../src/Renderer.js';
import {getRefererInfo} from '../src/refererDetection.js';

// NOTE this allows us to access the pv value outside of prebid after the auction request.
// import { getStorageManager } from '../src/storageManager.js'

const BIDDER_CODE = 'ozone';
// --- START REMOVE FOR RELEASE

// To remove this : php removecomments.php

/*
GET parameters (20211022):
pbjs_debug=true
renderer=https%3A%2F%2Fwww.ardm.io%2Fozone%2Fvideo-testing%2Fprod%2Fhtml5-renderer%2Fozone-renderer-20210406-scroll-listener-noviewportfix.js
auction=dev
cookiesync=dev
whitelabelPrefix + 'storedrequest'=[a valid stored request ID]
 */

// NOTE THAT the gvl is available at https://iabeurope.eu/vendor-list-tcf-v2-0/

// testing fake endpoint for cookie sync new code with postMessage
// const OZONECOOKIE = 'http://local.bussongs.com/prebid-cookie-sync-development.html';
// const OZONECOOKIESYNC = 'https://betalyst.local/prebid-cookie-sync-development.html';

// *** DEV-ozpr
// const ORIGIN = 'https://test-pub.ozpr.net';
// const ORIGIN = 'https://test.ozpr.net'; // to do a dev build, just uncomment this line & comment out the prod one
// const AUCTIONURI = '/openrtb2/auction';
// const OZONECOOKIESYNC = 'https://test.ozpr.net/static/load-cookie.html';
// const OZONE_RENDERER_URL = 'https://prebid.the-ozone-project.com/ozone-renderer.js';
// const OZONE_RENDERER_URL = 'https://www.ardm.io/ozone/2.2.0/testpages/test/ozone-renderer.js';
// const OZONE_RENDERER_URL = 'https://www.ardm.io/ozone/2.2.0/testpages/test/ozone-renderer.js';
// const OZONE_RENDERER_URL = 'https://www.betalyst.com/test/ozone-renderer-handle-refresh-guardian20200602-with-gpt.js';
// const OZONE_RENDERER_URL = 'http://silvermine.io/ozone/publishers/telegraph/ozone_files/ozone-renderer-jw-unruly.js';
// const OZONE_RENDERER_URL = 'https://www.betalyst.com/test/ozone-renderer-handle-refresh.js'; // video testing

// *** DEV-afsheen
// const AUCTIONURI = 'http://afsheen-dev.the-ozone-project.com/openrtb2/auction';
// const OZONECOOKIESYNC = 'http://afsheen-dev.the-ozone-project.com/static/load-cookie.html';
// const OZONE_RENDERER_URL = 'https://prebid.the-ozone-project.com/ozone-renderer.js';
// const OZONE_RENDERER_URL = 'https://www.ardm.io/ozone/2.2.0/testpages/test/ozone-renderer.js';
// const OZONE_RENDERER_URL = 'https://www.ardm.io/ozone/2.2.0/testpages/test/ozone-renderer.js';
// const OZONE_RENDERER_URL = 'https://www.betalyst.com/test/ozone-renderer-handle-refresh-guardian20200602-with-gpt.js';
// const OZONE_RENDERER_URL = 'http://silvermine.io/ozone/publishers/telegraph/ozone_files/ozone-renderer-jw-unruly.js';
// --- END REMOVE FOR RELEASE

// *** PROD ***
const ORIGIN = 'https://elb.the-ozone-project.com'; // applies only to auction & cookie
const AUCTIONURI = '/openrtb2/auction';
const OZONECOOKIESYNC = '/static/load-cookie.html';
// NOTE this was going to be renamed to renderer.js 20220210 because of newspass not wanting the word ozone - check - is this correct?
const OZONE_RENDERER_URL = 'https://prebid.the-ozone-project.com/ozone-renderer.js';
const ORIGIN_DEV = 'https://test.ozpr.net';

// --- START REMOVE FOR RELEASE
// const AUCTIONURI = 'https://www.betalyst.com/test/20200622-auction-2-bids.php'; // fake auction response with 2 bids from the same bidder for an adslot
// const OZONE_RENDERER_URL = 'https://www.betalyst.com/test/ozone-renderer-handle-refresh-via-gpt.js'; // video testing
// const OZONE_RENDERER_URL = 'https://www.betalyst.com/test/ozone-renderer-handle-refresh-guardian20200602-with-gpt.js';
// const OZONE_RENDERER_URL = 'https://www.betalyst.com/test/ozone-renderer-handle-refresh-guardian20200602-with-gpt-delay.php';
// const OZONE_RENDERER_URL = 'http://localhost:9888/ozone-renderer-handle-refresh-via-gpt.js'; // video testing local
// const OZONE_RENDERER_URL = 'http://localhost:9888/ozone-renderer-handle-refresh-guardian20200602-with-gpt.js'; // video testing local for guardian
// const OZONE_RENDERER_URL = 'http://localhost:9888/ozone-renderer-switch.js'; // video testing local

// 20200605 - test js renderer- this one includes the headers
// https://www.ardm.io/ozone/2.8.2/3-adslots-ozone-testpage-20220901-headers.html?pbjs_debug=true&ozstoredrequest=8000000328
//
// - this one doesn't
// https://www.ardm.io/ozone/2.8.2/3-adslots-ozone-testpage-20220901-noheaders.html?pbjs_debug=true&ozstoredrequest=8000000328options
// const OZONE_RENDERER_URL = 'https://www.ardm.io/ozone/2.2.0/testpages/test/ozone-renderer.js';
// --- END REMOVE FOR RELEASE
const OZONEVERSION = '3.0.0';
export const spec = {
  gvlid: 524,
  aliases: [{code: 'venatus', gvlid: 524}],
  version: OZONEVERSION,
  code: BIDDER_CODE,
  supportedMediaTypes: [VIDEO, BANNER],
  cookieSyncBag: {publisherId: null, siteId: null, userIdObject: {}}, // variables we want to make available to cookie sync
  propertyBag: {pageId: null, buildRequestsStart: 0, buildRequestsEnd: 0, endpointOverride: null}, /* allow us to store vars in instance scope - needs to be an object to be mutable */
  whitelabel_defaults: {
    'logId': 'OZONE',
    'bidder': 'ozone',
    'keyPrefix': 'oz',
    'auctionUrl': ORIGIN + AUCTIONURI,
    'cookieSyncUrl': ORIGIN + OZONECOOKIESYNC,
    'rendererUrl': OZONE_RENDERER_URL,
    'batchRequests': false /* you can change this to true OR numeric OR override it in the config: config.ozone.batchRequests = true/false/number */
  },

  // added for testing - maybe that onAdRenderSucceeded might be useful for tracking.
  // onBidWon: function(bid, options) { LogInfo('onBidWon', JSON.stringify(bid) ); },
  // onBidBillable: function(bid, options) { LogInfo('onBidBillable', JSON.stringify(bid)); },
  // onAdRenderSucceeded: function(bid, options) { LogInfo('onAdRenderSucceeded', JSON.stringify(bid)); },
  // onTimeout: function(timeoutData, options) { LogInfo('onTimeout', JSON.stringify(timeoutData)); },
  // onBidderError: function(args, options) { LogInfo('onBidderError', JSON.stringify(args)); },

  /**
   * make sure that the whitelabel/default values are available in the propertyBag
   * @param bid Object : the bid
   */
  loadWhitelabelData(bid) {
    if (this.propertyBag.whitelabel) { return; }
    this.propertyBag.whitelabel = JSON.parse(JSON.stringify(this.whitelabel_defaults));
    let bidder = bid.bidder || 'ozone'; // eg. ozone
    this.propertyBag.whitelabel.logId = bidder.toUpperCase();
    this.propertyBag.whitelabel.bidder = bidder;
    let bidderConfig = config.getConfig(bidder) || {};
    logInfo('got bidderConfig: ', deepClone(bidderConfig));
    if (bidderConfig.kvpPrefix) {
      this.propertyBag.whitelabel.keyPrefix = bidderConfig.kvpPrefix;
    }
    let arr = this.getGetParametersAsObject();
    if (bidderConfig.endpointOverride) {
      if (bidderConfig.endpointOverride.origin) {
        this.propertyBag.endpointOverride = bidderConfig.endpointOverride.origin;
        this.propertyBag.whitelabel.auctionUrl = bidderConfig.endpointOverride.origin + AUCTIONURI;
        this.propertyBag.whitelabel.cookieSyncUrl = bidderConfig.endpointOverride.origin + OZONECOOKIESYNC;
      }

      if (arr.hasOwnProperty('renderer')) {
        if (arr.renderer.match('%3A%2F%2F')) {
          this.propertyBag.whitelabel.rendererUrl = decodeURIComponent(arr['renderer']);
        } else {
          this.propertyBag.whitelabel.rendererUrl = arr['renderer'];
        }
      } else if (bidderConfig.endpointOverride.rendererUrl) {
        this.propertyBag.whitelabel.rendererUrl = bidderConfig.endpointOverride.rendererUrl;
      }
      if (bidderConfig.endpointOverride.cookieSyncUrl) {
        this.propertyBag.whitelabel.cookieSyncUrl = bidderConfig.endpointOverride.cookieSyncUrl;
      }
      if (bidderConfig.endpointOverride.auctionUrl) {
        this.propertyBag.endpointOverride = bidderConfig.endpointOverride.auctionUrl;
        this.propertyBag.whitelabel.auctionUrl = bidderConfig.endpointOverride.auctionUrl;
      }
    }
    if (bidderConfig.hasOwnProperty('batchRequests')) {
      // can be true/false/number
      if (this.batchValueIsValid(bidderConfig.batchRequests)) {
        this.propertyBag.whitelabel.batchRequests = bidderConfig.batchRequests;
      } else {
        logError('invalid config: batchRequest');
      }
    }
    if (bidderConfig.hasOwnProperty('videoParams')) {
      // set params value eg. {outstream: 3, instream: 1} - don't necessarily need both
      this.propertyBag.whitelabel.videoParams = bidderConfig.videoParams;
    }
    // you can force batching on by GET: ?batchRequests=number (not boolean)
    if (arr.hasOwnProperty('batchRequests')) {
      let getBatch = parseInt(arr.batchRequests);
      if (this.batchValueIsValid(getBatch)) {
        this.propertyBag.whitelabel.batchRequests = getBatch;
      } else {
        logError('invalid GET: batchRequests');
      }
    }
    try {
      if (arr.hasOwnProperty('auction') && arr.auction === 'dev') {
        logInfo('GET: auction=dev');
        this.propertyBag.whitelabel.auctionUrl = ORIGIN_DEV + AUCTIONURI;
      }
      if (arr.hasOwnProperty('cookiesync') && arr.cookiesync === 'dev') {
        logInfo('GET: cookiesync=dev');
        this.propertyBag.whitelabel.cookieSyncUrl = ORIGIN_DEV + OZONECOOKIESYNC;
      }
    } catch (e) {}

    // if (bidderConfig.hasOwnProperty('eid')) {
    //   this.propertyBag.whitelabel.eid = bidderConfig.eid;
    // }
    logInfo('whitelabel: ', this.propertyBag.whitelabel);
  },
  batchValueIsValid(batch) {
    return typeof batch === 'boolean' || (typeof batch === 'number' && batch > 0);
  },
  getAuctionUrl() {
    return this.propertyBag.whitelabel.auctionUrl;
  },
  getCookieSyncUrl() {
    return this.propertyBag.whitelabel.cookieSyncUrl;
  },
  getRendererUrl() {
    return this.propertyBag.whitelabel.rendererUrl;
  },
  /**
   * get the value to use for `placement` or null (don't set placement value)
   * @param context string  is 'outstream' or 'instream'
   */
  getVideoPlacementValue: function(context) {
    if (['instream', 'outstream'].indexOf(context) < 0) return null; /* do not allow arbitrary strings */
    return deepAccess(this.propertyBag, `whitelabel.videoParams.${context}`, null);
  },
  /**
   * Return value of false means don't batch. Otherwise batch to the number returned.
   * @returns boolean|int
   */
  getBatchRequests() {
    if (this.propertyBag.whitelabel.batchRequests === true) { return 10; }
    if (typeof this.propertyBag.whitelabel.batchRequests === 'number' && this.propertyBag.whitelabel.batchRequests > 0) {
      return this.propertyBag.whitelabel.batchRequests;
    }
    return false;
  },
  /**
   * Basic check to see whether required parameters are in the request.
   * @param bid
   * @returns {boolean}
   */
  isBidRequestValid(bid) {
    let vf = 'VALIDATION FAILED';
    this.loadWhitelabelData(bid);
    logInfo('isBidRequestValid : ', config.getConfig(), bid);
    let adUnitCode = bid.adUnitCode; // adunit[n].code
    let err1 = `${vf} : missing {param} : siteId, placementId and publisherId are REQUIRED`;
    if (!(getBidIdParameter('placementId', bid.params))) {
      logError(err1.replace('{param}', 'placementId'), adUnitCode);
      return false;
    }
    if (!this.isValidPlacementId(bid.params.placementId)) {
      logError(`${vf} : placementId must be exactly 10 numbers`, adUnitCode);
      return false;
    }
    if (!(getBidIdParameter('publisherId', bid.params))) {
      logError(err1.replace('{param}', 'publisherId'), adUnitCode);
      return false;
    }
    if (!(bid.params.publisherId).toString().match(/^[a-zA-Z0-9\-]{12}$/)) {
      logError(`${vf} : publisherId must be /^[a-zA-Z0-9\\-]{12}$/`, adUnitCode);
      return false;
    }
    if (!(getBidIdParameter('siteId', bid.params))) {
      logError(err1.replace('{param}', 'siteId'), adUnitCode);
      return false;
    }
    if (!(bid.params.siteId).toString().match(/^[0-9]{10}$/)) {
      logError(`${vf} : siteId must be /^[0-9]{10}$/`, adUnitCode);
      return false;
    }
    if (bid.params.hasOwnProperty('customParams')) {
      logError(`${vf} : customParams should be renamed: customData`, adUnitCode);
      return false;
    }
    if (bid.params.hasOwnProperty('customData')) {
      if (!isArray(bid.params.customData)) {
        logError(`${vf} : customData is not an Array`, adUnitCode);
        return false;
      }
      if (bid.params.customData.length < 1) {
        logError(`${vf} : empty customData`, adUnitCode);
        return false;
      }
      if (!(bid.params.customData[0]).hasOwnProperty('targeting')) {
        logError(`${vf} :no customData[0].targeting`, adUnitCode);
        return false;
      }
      if (typeof bid.params.customData[0]['targeting'] != 'object') {
        logError(`${vf} : customData[0].targeting is not an Object`, adUnitCode);
        return false;
      }
    }
    if (bid.hasOwnProperty('mediaTypes') && bid.mediaTypes.hasOwnProperty(VIDEO)) {
      if (!bid.mediaTypes?.[VIDEO]?.context) {
        logError(`${vf} No video context key/value`);
        return false;
      }
      if (['instream', 'outstream'].indexOf(bid.mediaTypes?.[VIDEO]?.context) < 0) {
        logError(`${vf} video.context is invalid.`);
        return false;
      }
    }
    return true;
  },

  /**
   * Split this out so that we can validate the placementId and also the override GET parameter ozstoredrequest
   * @param placementId
   */
  isValidPlacementId(placementId) {
    return placementId.toString().match(/^[0-9]{10}$/);
  },

  buildRequests(validBidRequests, bidderRequest) {
    this.loadWhitelabelData(validBidRequests[0]);
    this.propertyBag.buildRequestsStart = new Date().getTime();
    // either use these whitelabel values or set to hardcoded ozone & oz, to set the adserver keys to standard.
    let whitelabelBidder = this.propertyBag.whitelabel.bidder; // by default = ozone
    let whitelabelPrefix = this.propertyBag.whitelabel.keyPrefix;
    logInfo(`buildRequests time: ${this.propertyBag.buildRequestsStart} v ${OZONEVERSION} validBidRequests`, deepClone(validBidRequests), 'bidderRequest', deepClone(bidderRequest));
    // First check - is there any config to block this request?
    if (this.blockTheRequest()) {
      return [];
    }
    // detect if FLEDGE is enabled:
    let fledgeEnabled = !!bidderRequest.fledgeEnabled; // IF true then this is added as each bid[].ext.ae=1

    let htmlParams = {'publisherId': '', 'siteId': ''};
    if (validBidRequests.length > 0) {
      // this would do, if we could rely on stuff being where it should be & everyone using new versions of prebid (they dont)
      // this.cookieSyncBag.userIdObject = Object.assign(this.cookieSyncBag.userIdObject, this.findAllUserIdsFromEids(validBidRequests[0]));
      Object.assign(this.cookieSyncBag.userIdObject, this.findAllUserIdsFromEids(validBidRequests[0]));
      this.cookieSyncBag.siteId = deepAccess(validBidRequests[0], 'params.siteId');
      this.cookieSyncBag.publisherId = deepAccess(validBidRequests[0], 'params.publisherId');
      htmlParams = validBidRequests[0].params;
    }
    logInfo('cookie sync bag', this.cookieSyncBag);
    let singleRequest = this.getWhitelabelConfigItem('ozone.singleRequest');
    singleRequest = singleRequest !== false; // undefined & true will be true
    let ozoneRequest = {}; // we only want to set specific properties on this, not validBidRequests[0].params

    // First party data module : look for ortb2 in setconfig & set the User object. NOTE THAT this should happen before we set the consentString
    // NOTE - see https://docs.prebid.org/features/firstPartyData.html
    let fpd = deepAccess(bidderRequest, 'ortb2', null);
    logInfo('got ortb2 fpd: ', fpd);
    if (fpd && deepAccess(fpd, 'user')) {
      logInfo('added FPD user object');
      ozoneRequest.user = fpd.user;
    }

    const getParams = this.getGetParametersAsObject();
    const wlOztestmodeKey = whitelabelPrefix + 'testmode';
    const isTestMode = getParams[wlOztestmodeKey] || null; // this can be any string, it's used for testing ads
    // ozoneRequest.device = {'w': window.innerWidth, 'h': window.innerHeight};
    ozoneRequest.device = bidderRequest?.ortb2?.device || {}; // 20240925 rupesh changed this
    let placementIdOverrideFromGetParam = this.getPlacementIdOverrideFromGetParam(); // null or string
    // build the array of params to attach to `imp`
    let schain = null;
    // 20240715 - reintroduced for publishers who opt in. NOTE that there might be a bug so that this is set to "0" which evaluates to true
    // if auctionId contains a valid value then we will use this as the root id, else we will generate our own
    // we will also add it into the imp
    var auctionId = deepAccess(validBidRequests, '0.ortb2.source.tid');
    if (auctionId === '0') {
      auctionId = null;
    }

    let tosendtags = validBidRequests.map(ozoneBidRequest => {
      var obj = {};
      let placementId = placementIdOverrideFromGetParam || this.getPlacementId(ozoneBidRequest); // prefer to use a valid override param, else the bidRequest placement Id
      obj.id = ozoneBidRequest.bidId; // this causes an error if we change it to something else, even if you update the bidRequest object: "WARNING: Bidder ozone made bid for unknown request ID: mb7953.859498327448. Ignoring."
      obj.tagid = placementId;
      obj.secure = parseUrl(getRefererInfo().page).protocol === 'https' ? 1 : 0;
      // is there a banner (or nothing declared, so banner is the default)?
      let arrBannerSizes = [];
      if (!ozoneBidRequest.hasOwnProperty('mediaTypes')) {
        if (ozoneBidRequest.hasOwnProperty('sizes')) {
          arrBannerSizes = ozoneBidRequest.sizes;
        } else {
          logInfo('no mediaTypes or sizes array. Cannot set sizes for banner type');
        }
      } else {
        if (ozoneBidRequest.mediaTypes.hasOwnProperty(BANNER)) {
          arrBannerSizes = ozoneBidRequest.mediaTypes[BANNER].sizes; /* Note - if there is a sizes element in the config root it will be pushed into here */
          logInfo('setting banner size from mediaTypes.banner for bidId ' + obj.id + ': ', arrBannerSizes);
        }
        if (ozoneBidRequest.mediaTypes.hasOwnProperty(VIDEO)) {
          logInfo('openrtb 2.5 compliant video');
          // examine all the video attributes in the config, and either put them into obj.video if allowed by IAB2.5 or else in to obj.video.ext
          if (typeof ozoneBidRequest.mediaTypes[VIDEO] == 'object') {
            let childConfig = deepAccess(ozoneBidRequest, 'params.video', {});
            obj.video = this.unpackVideoConfigIntoIABformat(ozoneBidRequest.mediaTypes[VIDEO], childConfig);
            obj.video = this.addVideoDefaults(obj.video, ozoneBidRequest.mediaTypes[VIDEO], childConfig);
          }
          // we need to duplicate some of the video values
          let wh = getWidthAndHeightFromVideoObject(obj.video);
          logInfo(`setting video object ${obj.id} from mediaTypes.video: `, obj.video, 'wh=', wh);
          let settingToBe = 'setting obj.video.format to be '; // partial, reusable phrase
          if (wh && typeof wh === 'object') {
            obj.video.w = wh['w'];
            obj.video.h = wh['h'];
            if (playerSizeIsNestedArray(obj.video)) { // this should never happen; it was in the original spec for this change though.
              logInfo(`${settingToBe} an array of objects`);
              obj.video.ext.format = [wh];
            } else {
              logInfo(`${settingToBe} an object`);
              obj.video.ext.format = wh;
            }
          } else {
            logWarn(`Failed ${settingToBe} anything - bad config`);
          }
        }
        // Native integration is not complete yet
        if (ozoneBidRequest.mediaTypes.hasOwnProperty(NATIVE)) {
          obj.native = ozoneBidRequest.mediaTypes[NATIVE];
          logInfo(`setting native object ${obj.id} from mediaTypes.native element:`, obj.native);
        }
        // is the publisher specifying floors, and is the floors module enabled?
        if (ozoneBidRequest.hasOwnProperty('getFloor')) {
          obj.floor = this.getFloorObjectForAuction(ozoneBidRequest);
          logInfo('obj.floor is : ', obj.floor);
        } else {
          logInfo('no getFloor property');
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
      // these 3 DO exist - we check them in the validation method
      obj.placementId = placementId;
      // build the imp['ext'] object - NOTE - Dont obliterate anything that' already in obj.ext
      deepSetValue(obj, 'ext.prebid', {'storedrequest': {'id': placementId}});
      // obj.ext = {'prebid': {'storedrequest': {'id': placementId}}};
      obj.ext[whitelabelBidder] = {};
      obj.ext[whitelabelBidder].adUnitCode = ozoneBidRequest.adUnitCode; // eg. 'mpu'
      // obj.ext[whitelabelBidder].transactionId = ozoneBidRequest.transactionId; // this is the transactionId PER adUnit, common across bidders for this unit. Removed in prebid 8
      if (ozoneBidRequest.params.hasOwnProperty('customData')) {
        obj.ext[whitelabelBidder].customData = ozoneBidRequest.params.customData;
      }
      // 20250114 - optional ozFloor param in adunits - for users who don't want to use the floors module. Send this up as imp[].ext.ozone.ozFloor
      if (ozoneBidRequest.params.hasOwnProperty('ozFloor')) {
        let ozFloorParsed = parseFloat(ozoneBidRequest.params.ozFloor);
        if (!isNaN(ozFloorParsed)) {
          obj.ext[whitelabelBidder].ozFloor = ozFloorParsed;
        } else {
          logError(`Ignoring invalid ozFloor value for adunit code: ${ozoneBidRequest.adUnitCode}`);
        }
      }
      logInfo(`obj.ext.${whitelabelBidder} is `, obj.ext[whitelabelBidder]);
      if (isTestMode != null) {
        logInfo(`setting isTestMode: ${isTestMode}`);
        if (obj.ext[whitelabelBidder].hasOwnProperty('customData')) {
          for (let i = 0; i < obj.ext[whitelabelBidder].customData.length; i++) {
            obj.ext[whitelabelBidder].customData[i]['targeting'][wlOztestmodeKey] = isTestMode;
          }
        } else {
          obj.ext[whitelabelBidder].customData = [{'settings': {}, 'targeting': {}}];
          obj.ext[whitelabelBidder].customData[0].targeting[wlOztestmodeKey] = isTestMode;
        }
      }
      if (fpd && deepAccess(fpd, 'site')) {
        // attach the site fpd into exactly : imp[n].ext.[whitelabel].customData.0.targeting
        logInfo('adding fpd.site');
        if (deepAccess(obj, `ext.${whitelabelBidder}.customData.0.targeting`, false)) {
          Object.assign(obj.ext[whitelabelBidder].customData[0].targeting, fpd.site);
        } else {
          deepSetValue(obj, `ext.${whitelabelBidder}.customData.0.targeting`, fpd.site);
        }
      }
      if (!schain && deepAccess(ozoneBidRequest, 'schain')) {
        schain = ozoneBidRequest.schain;
      }

      // gpid 20230620. If prebid has been compiled with gptPreAuction module then set the gpid in the required location
      // https://docs.xandr.com/bundle/industry-reference/page/publisher-best-practices-for-the-trade-desk.html
      let gpid = deepAccess(ozoneBidRequest, 'ortb2Imp.ext.gpid');
      // let pbadslot = deepAccess(ozoneBidRequest, 'ortb2Imp.ext.data.pbadslot'); // this is the same as gpid anyway, just older tech that prebid are looking to phase out
      if (gpid) {
        deepSetValue(obj, 'ext.gpid', gpid);
      }

      // 20240715 - adding these
      let transactionId = deepAccess(ozoneBidRequest, 'ortb2Imp.ext.tid');
      if (transactionId) {
        obj.ext[whitelabelBidder].transactionId = transactionId; // this is the transactionId PER adUnit, common across bidders for this unit
      }
      // NOTE we need to use the sanitised version of auctionId because we are seeing bad data of "0"
      if (auctionId) {
        obj.ext[whitelabelBidder].auctionId = auctionId; // we were sent a valid auctionId to use - this will also be used as the root id value for the request
      }

      // 20240227 - adding support for fledge
      if (fledgeEnabled) { // fledge is enabled at some config level - pbjs.setBidderConfig or pbjs.setConfig
        const auctionEnvironment = deepAccess(ozoneBidRequest, 'ortb2Imp.ext.ae'); // this will be set for one of 3 reasons; adunit, setBidderConfig, setConfig
        if (isInteger(auctionEnvironment)) {
          // deepSetValue(obj, 'ext.prebid.ae', auctionEnvironment); // changed 20240606 - standardising
          deepSetValue(obj, 'ext.ae', auctionEnvironment);
        } else {
          logError(`ignoring ortb2Imp.ext.ae - not an integer for obj.id=${obj.id}`);
        }
        // deepSetValue(obj, 'ext.prebid.ae', 1);
      }
      return obj;
    });

    // in v 2.0.0 we moved these outside of the individual ad slots
    let extObj = {};
    extObj[whitelabelBidder] = {};
    extObj[whitelabelBidder][`${whitelabelPrefix}_pb_v`] = OZONEVERSION;
    extObj[whitelabelBidder][`${whitelabelPrefix}_rw`] = placementIdOverrideFromGetParam ? 1 : 0;
    if (validBidRequests.length > 0) {
      let userIds = this.cookieSyncBag.userIdObject; // 2021-01-06 - slight optimisation - we've already found this info
      if (userIds.hasOwnProperty('pubcid.org')) {
        // NOTE we are still setting ext.ozone.pubcid even though we have switched to using eids keys for the cookie sync
        extObj[whitelabelBidder].pubcid = userIds['pubcid.org'];
      }
    }


    extObj[whitelabelBidder].pv = this.getPageId(); // attach the page ID that will be common to all auction calls for this page if refresh() is called
    let ozOmpFloorDollars = this.getWhitelabelConfigItem('ozone.oz_omp_floor'); // valid only if a dollar value (typeof == 'number')
    logInfo(`${whitelabelPrefix}_omp_floor dollar value = `, ozOmpFloorDollars);
    if (typeof ozOmpFloorDollars === 'number') {
      extObj[whitelabelBidder][`${whitelabelPrefix}_omp_floor`] = ozOmpFloorDollars;
    } else if (typeof ozOmpFloorDollars !== 'undefined') {
      logError(`IF set, ${whitelabelPrefix}_omp_floor must be a number eg. 1.55. Found:` + (typeof ozOmpFloorDollars));
    }
    let ozWhitelistAdserverKeys = this.getWhitelabelConfigItem('ozone.oz_whitelist_adserver_keys');
    let useOzWhitelistAdserverKeys = isArray(ozWhitelistAdserverKeys) && ozWhitelistAdserverKeys.length > 0;
    extObj[whitelabelBidder][whitelabelPrefix + '_kvp_rw'] = useOzWhitelistAdserverKeys ? 1 : 0;
    if (whitelabelBidder !== 'ozone') {
      logInfo('setting aliases object');
      extObj.prebid = {aliases: {'ozone': whitelabelBidder}};
    }
    if (this.propertyBag.endpointOverride != null) { extObj[whitelabelBidder]['origin'] = this.propertyBag.endpointOverride; }

    // extObj.ortb2 = config.getConfig('ortb2'); // original test location
    // 20220628 - got rid of special treatment for adserver.org
    let userExtEids = deepAccess(validBidRequests, '0.userIdAsEids', []); // generate the UserIDs in the correct format for UserId module





      // 20250502 testing
    // let eid = this.getWhitelabelConfigItem('ozone.eid');
    // if(eid) {
    //   logInfo('Found propertyBag eid', eid);
    //   userExtEids.push(eid);
    // }





      // logInfo('getRefererInfo', getRefererInfo());
    ozoneRequest.site = {
      'publisher': {'id': htmlParams.publisherId},
      'page': getRefererInfo().page,
      'id': htmlParams.siteId
    };
    ozoneRequest.test = config.getConfig('debug') ? 1 : 0;

    // this should come as late as possible so it overrides any user.ext.consent value
    if (bidderRequest && bidderRequest.gdprConsent) {
      logInfo('ADDING GDPR');
      let apiVersion = deepAccess(bidderRequest, 'gdprConsent.apiVersion', 1);
      ozoneRequest.regs = {ext: {gdpr: bidderRequest.gdprConsent.gdprApplies ? 1 : 0, apiVersion: apiVersion}};
      if (deepAccess(ozoneRequest, 'regs.ext.gdpr')) {
        deepSetValue(ozoneRequest, 'user.ext.consent', bidderRequest.gdprConsent.consentString);
      } else {
        logWarn('**** Strange CMP info: bidderRequest.gdprConsent exists BUT bidderRequest.gdprConsent.gdprApplies is false. See bidderRequest logged above. ****');
      }
    } else {
      logInfo('WILL NOT ADD GDPR info; no bidderRequest.gdprConsent object');
    }
    if (bidderRequest && bidderRequest.uspConsent) {
      logInfo('ADDING USP consent info');
      // 20220322 adding usp in the correct location https://docs.prebid.org/prebid-server/developers/add-new-bidder-go.html
      // 20220322 IAB correct location, changed from user.ext.uspConsent
      deepSetValue(ozoneRequest, 'regs.ext.us_privacy', bidderRequest.uspConsent);
    } else {
      logInfo('WILL NOT ADD USP consent info; no bidderRequest.uspConsent.');
    }
    // coded from https://docs.prebid.org/dev-docs/modules/consentManagementGpp.html
    if (bidderRequest?.ortb2?.regs?.gpp) {
      // 20240604 - Pat - regs.ext.gpp -> regs.gpp
      deepSetValue(ozoneRequest, 'regs.gpp', bidderRequest.ortb2.regs.gpp);
      deepSetValue(ozoneRequest, 'regs.gpp_sid', bidderRequest.ortb2.regs.gpp_sid);
    }

    if (schain) { // we set this while iterating over the bids
      logInfo('schain found');
      deepSetValue(ozoneRequest, 'source.ext.schain', schain);
    }

    // this is for 2.2.1
    // coppa compliance
    if (config.getConfig('coppa') === true) {
      deepSetValue(ozoneRequest, 'regs.coppa', 1);
    }

    // 20240604 - get the navigator.cookieDeprecationLabel from bid.device.ext.cdep (will not exist if no value)
    extObj[whitelabelBidder].cookieDeprecationLabel = deepAccess(bidderRequest, 'ortb2.device.ext.cdep', 'none');
    logInfo(`cookieDeprecationLabel ortb2.device.ext.cdep = ${extObj[whitelabelBidder].cookieDeprecationLabel}`);

    /*
    For a bid request, no matter whether single, batch or non-single:
====================++==============================++===========
id = unique random, always
source.tid AND imp[].ext.ozone.auctionId = auctionId (validBidRequests[].ortb2.source.tid) if pub opts in & it is set
imp[].ext.ozone.transactionId = transactionId (validBidRequests[].ortb2Imp.ext.tid) if pub opts in & it is set

     */

    // are we to batch the requests (used by reach)
    let batchRequestsVal = this.getBatchRequests(); // false|numeric
    if (typeof batchRequestsVal === 'number') {
      logInfo(`Batching = ${batchRequestsVal}`);
      let arrRet = []; // return an array of objects containing data describing max 10 bids
      for (let i = 0; i < tosendtags.length; i += batchRequestsVal) {
        // 20240715 either use the valid auctionId value or our own generated one
        ozoneRequest.id = generateUUID(); // Unique ID of the bid request, provided by the exchange. (REQUIRED)
        deepSetValue(ozoneRequest, 'user.ext.eids', userExtEids);
        // https://www.iab.com/wp-content/uploads/2016/03/OpenRTB-API-Specification-Version-2-5-FINAL.pdf
        if (auctionId) {
          deepSetValue(ozoneRequest, 'source.tid', auctionId);
        }
        ozoneRequest.imp = tosendtags.slice(i, i + batchRequestsVal);
        ozoneRequest.ext = extObj;
        if (ozoneRequest.imp.length > 0) {
          arrRet.push({
            method: 'POST',
            url: this.getAuctionUrl(),
            data: JSON.stringify(ozoneRequest),
            bidderRequest: bidderRequest
          });
        }
      }
      logInfo('batch request going to return : ', arrRet);
      return arrRet;
    }

    // Not batched - return the single request object OR the array:
    if (singleRequest) {
      logInfo('single request starting');
      // 20240715 either use the valid auctionId value or our own generated one
      ozoneRequest.id = generateUUID(); // Unique ID of the bid request, provided by the exchange. (REQUIRED)
      ozoneRequest.imp = tosendtags;
      ozoneRequest.ext = extObj;
      deepSetValue(ozoneRequest, 'user.ext.eids', userExtEids);
      // https://www.iab.com/wp-content/uploads/2016/03/OpenRTB-API-Specification-Version-2-5-FINAL.pdf
      if (auctionId) {
        deepSetValue(ozoneRequest, 'source.tid', auctionId);
      }
      var ret = {
        method: 'POST',
        url: this.getAuctionUrl(),
        data: JSON.stringify(ozoneRequest),
        bidderRequest: bidderRequest
      };
      this.propertyBag.buildRequestsEnd = new Date().getTime();
      logInfo(`buildRequests going to return for single at time ${this.propertyBag.buildRequestsEnd} (took ${this.propertyBag.buildRequestsEnd - this.propertyBag.buildRequestsStart}ms): `, deepClone(ret));
      return ret;
    }
    // not single request - pull apart the tosendtags array & return an array of objects each containing one element in the imp array.
    let arrRet = tosendtags.map(imp => {
      logInfo('non-single response, working on imp : ', imp);
      let ozoneRequestSingle = Object.assign({}, ozoneRequest);
      ozoneRequestSingle.id = generateUUID(); // Unique ID of the bid request, provided by the exchange. (REQUIRED)

      ozoneRequestSingle.imp = [imp];
      ozoneRequestSingle.ext = extObj;
      // ozoneRequestSingle.source = {'tid': imp.ext[whitelabelBidder].transactionId};
      deepSetValue(ozoneRequestSingle, 'user.ext.eids', userExtEids);
      // https://www.iab.com/wp-content/uploads/2016/03/OpenRTB-API-Specification-Version-2-5-FINAL.pdf
      if (auctionId) {
        deepSetValue(ozoneRequestSingle, 'source.tid', auctionId);
      }
      return {
        method: 'POST',
        url: this.getAuctionUrl(),
        data: JSON.stringify(ozoneRequestSingle),
        bidderRequest: bidderRequest
      };
    });
    this.propertyBag.buildRequestsEnd = new Date().getTime();
    logInfo(`buildRequests going to return for non-single at time ${this.propertyBag.buildRequestsEnd} (took ${this.propertyBag.buildRequestsEnd - this.propertyBag.buildRequestsStart}ms): `, arrRet);
    return arrRet;
  },
  /**
   * parse a bidRequestRef that contains getFloor(), get all the data from it for the sizes & media requested for this bid & return an object containing floor data you can send to auction endpoint
   * @param bidRequestRef object = a valid bid request object reference
   * @returns object
   *
   * call:
   * bidObj.getFloor({
      currency: 'USD', <- currency to return the value in
      mediaType: ‘banner’,
      size: ‘*’ <- or [300,250] or [[300,250],[640,480]]
   * });
   *
   *
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
    // 20250108 - take only the first size - this is how it works.
    if (mediaTypesSizes.banner) {
      ret.banner = bidRequestRef.getFloor({mediaType: 'banner', currency: 'USD', size: mediaTypesSizes.banner[0]});
    }
    if (mediaTypesSizes.video) {
      ret.video = bidRequestRef.getFloor({mediaType: 'video', currency: 'USD', size: mediaTypesSizes.video[0]});
    }
    if (mediaTypesSizes.native) {
      ret.native = bidRequestRef.getFloor({mediaType: 'native', currency: 'USD', size: mediaTypesSizes.native[0]});
    }
    logInfo('getFloorObjectForAuction returning : ', deepClone(ret));
    return ret;
  },
  /**
   * Interpret the response if the array contains BIDDER elements, in the format: [ [bidder1 bid 1, bidder1 bid 2], [bidder2 bid 1, bidder2 bid 2] ]
   * NOte that in singleRequest mode this will be called once, else it will be called for each adSlot's response
   *
   * Updated April 2019 to return all bids, not just the one we decide is the 'winner'
   *
   * https://docs.prebid.org/dev-docs/bidder-adaptor.html#bidder-adaptor-Interpreting-the-Response
   *
   * @param serverResponse
   * @param request
   * @returns {*}
   */
  interpretResponse(serverResponse, request) {
    if (request && request.bidderRequest && request.bidderRequest.bids) { this.loadWhitelabelData(request.bidderRequest.bids[0]); }
    let startTime = new Date().getTime();
    let whitelabelBidder = this.propertyBag.whitelabel.bidder; // by default = ozone
    let whitelabelPrefix = this.propertyBag.whitelabel.keyPrefix;
    logInfo(`interpretResponse time: ${startTime} . Time between buildRequests done and interpretResponse start was ${startTime - this.propertyBag.buildRequestsEnd}ms`);
    logInfo(`serverResponse, request`, deepClone(serverResponse), deepClone(request));
    serverResponse = serverResponse.body || {};
    let aucId = serverResponse.id; // this will be correct for single requests and non-single
    // note that serverResponse.id value is the auction_id we might want to use for reporting reasons.
    if (!serverResponse.hasOwnProperty('seatbid')) {
      return [];
    }
    if (typeof serverResponse.seatbid !== 'object') {
      return [];
    }
    let arrAllBids = [];
    let labels;
    let enhancedAdserverTargeting = this.getWhitelabelConfigItem('ozone.enhancedAdserverTargeting');
    logInfo('enhancedAdserverTargeting', enhancedAdserverTargeting);
    if (typeof enhancedAdserverTargeting == 'undefined') {
      enhancedAdserverTargeting = true;
    }
    logInfo('enhancedAdserverTargeting', enhancedAdserverTargeting);

    // 2021-03-05 - comment this out for a build without adding adid to the response
    serverResponse.seatbid = injectAdIdsIntoAllBidResponses(serverResponse.seatbid); // we now make sure that each bid in the bidresponse has a unique (within page) adId attribute.

    serverResponse.seatbid = this.removeSingleBidderMultipleBids(serverResponse.seatbid);
    let ozOmpFloorDollars = this.getWhitelabelConfigItem('ozone.oz_omp_floor'); // valid only if a dollar value (typeof == 'number')
    let addOzOmpFloorDollars = typeof ozOmpFloorDollars === 'number';
    let ozWhitelistAdserverKeys = this.getWhitelabelConfigItem('ozone.oz_whitelist_adserver_keys');
    let useOzWhitelistAdserverKeys = isArray(ozWhitelistAdserverKeys) && ozWhitelistAdserverKeys.length > 0;

    for (let i = 0; i < serverResponse.seatbid.length; i++) {
      let sb = serverResponse.seatbid[i];
      for (let j = 0; j < sb.bid.length; j++) {
        let thisRequestBid = this.getBidRequestForBidId(sb.bid[j].impid, request.bidderRequest.bids);
        logInfo(`seatbid:${i}, bid:${j} Going to set default w h for seatbid/bidRequest`, sb.bid[j], thisRequestBid);
        // ensure width etc is in place
        let {defaultWidth, defaultHeight} = defaultSize(thisRequestBid);
        let thisBid = ozoneAddStandardProperties(sb.bid[j], defaultWidth, defaultHeight);
        // prebid 4.0 compliance
        thisBid.meta = {advertiserDomains: thisBid.adomain || []};
        let videoContext = null;
        let isVideo = false;
        let bidType = deepAccess(thisBid, 'ext.prebid.type');
        logInfo(`this bid type is : ${bidType}`);
        let adserverTargeting = {};
        if (bidType === VIDEO) {
          isVideo = true;
          this.setBidMediaTypeIfNotExist(thisBid, VIDEO);
          videoContext = this.getVideoContextForBidId(thisBid.bidId, request.bidderRequest.bids); // should be instream or outstream (or null if error)
          if (videoContext === 'outstream') {
            logInfo('setting thisBid.mediaType = VIDEO & attach a renderer to OUTSTREAM video');
            thisBid.renderer = newRenderer(thisBid.bidId);

            // 20250325 change - add these (and change id=hb_cache_id to uuid=hb_uuid):
            thisBid.vastUrl = `https://${deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_host', 'missing_host')}${deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_path', 'missing_path')}?uuid=${deepAccess(thisBid, 'ext.prebid.targeting.hb_uuid', 'missing_uuid')}`;
            // 20250326 try pulling in the whole targeting object (see below)
            // adserverTargeting['hb_cache_host'] = deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_host', 'no-host');
            // adserverTargeting['hb_cache_path'] = deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_path', 'no-path');
            thisBid.vastXml = thisBid.adm;
          } else {
            logInfo('not an outstream video (presumably instream), will set thisBid.mediaType = VIDEO and thisBid.vastUrl and not attach a renderer');
            // prebid core sends this as 'description_url' which is not useful for vast tag param placeholders
            // 20250325 change id=hb_cache_id to uuid=hb_uuid
            thisBid.vastUrl = `https://${deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_host', 'missing_host')}${deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_path', 'missing_path')}?uuid=${deepAccess(thisBid, 'ext.prebid.targeting.hb_uuid', 'missing_uuid')}`; // need to see if this works ok for ozone
            // thisBid.vastXml = thisBid.adm; // this needs the cache config in-page
            // add hb_cache_... keys/values to the server targeting
            // 20250326 try pulling in the whole targeting object (see below)
            // adserverTargeting['hb_cache_host'] = deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_host', 'no-host');
            // adserverTargeting['hb_cache_path'] = deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_path', 'no-path');

            // 20220525 - this could be set by the auction endpoint, but however it's set, it gets prebid (auction.js) to add the targeting key hb_uuid which is used on the adserver to locate the cached ad
            if (!thisBid.hasOwnProperty('videoCacheKey')) {
              let videoCacheUuid = deepAccess(thisBid, 'ext.prebid.targeting.hb_uuid', 'no_hb_uuid');
              logInfo(`Adding videoCacheKey: ${videoCacheUuid}`);
              thisBid.videoCacheKey = videoCacheUuid;
            } else {
              logInfo('videoCacheKey already exists on the bid object, will not add it');
            }
          }
        } else {
          // must be a banner
          this.setBidMediaTypeIfNotExist(thisBid, BANNER);
          // 20250227 - trying this out for ozone banner ad cacheing - not necessarily going to be keeping it
          // 20250326 try pulling in the whole targeting object (see below)
          // adserverTargeting['hb_cache_host'] = deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_host', 'no-host');
          // adserverTargeting['hb_cache_path'] = deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_path', 'no-path');
        }

        // 20250326 - add all the cache keys, for future proofing
        adserverTargeting = Object.assign(adserverTargeting, deepAccess(thisBid, 'ext.prebid.targeting', {}));

        if (enhancedAdserverTargeting) {
          // NOTE - string concatenation for multiple vars is (slightly) faster than templating : https://stackoverflow.com/questions/29055518/are-es6-template-literals-faster-than-string-concatenation
          let allBidsForThisBidid = ozoneGetAllBidsForBidId(thisBid.bidId, serverResponse.seatbid, defaultWidth, defaultHeight);
          // add all the winning & non-winning bids for this bidId:
          logInfo('Going to iterate allBidsForThisBidId', deepClone(allBidsForThisBidid));
          Object.keys(allBidsForThisBidid).forEach((bidderName, index, ar2) => {
            logInfo(`adding adserverTargeting for ${bidderName} for bidId ${thisBid.bidId}`);
            // let bidderName = bidderNameWH.split('_')[0];
            adserverTargeting[whitelabelPrefix + '_' + bidderName] = bidderName;
            adserverTargeting[whitelabelPrefix + '_' + bidderName + '_crid'] = String(allBidsForThisBidid[bidderName].crid);
            adserverTargeting[whitelabelPrefix + '_' + bidderName + '_adv'] = String(allBidsForThisBidid[bidderName].adomain);
            adserverTargeting[whitelabelPrefix + '_' + bidderName + '_adId'] = String(allBidsForThisBidid[bidderName].adId);
            adserverTargeting[whitelabelPrefix + '_' + bidderName + '_pb_r'] = getRoundedBid(allBidsForThisBidid[bidderName].price, allBidsForThisBidid[bidderName].ext.prebid.type);
            adserverTargeting[whitelabelPrefix + '_' + bidderName + '_size'] = String(allBidsForThisBidid[bidderName].width) + 'x' + String(allBidsForThisBidid[bidderName].height);
            if (allBidsForThisBidid[bidderName].hasOwnProperty('dealid')) {
              adserverTargeting[whitelabelPrefix + '_' + bidderName + '_dealid'] = String(allBidsForThisBidid[bidderName].dealid);
            }
            if (addOzOmpFloorDollars) {
              adserverTargeting[whitelabelPrefix + '_' + bidderName + '_omp'] = allBidsForThisBidid[bidderName].price >= ozOmpFloorDollars ? '1' : '0';
            }
            if (isVideo) {
              adserverTargeting[whitelabelPrefix + '_' + bidderName + '_vid'] = videoContext; // outstream or instream
            }
            let flr = deepAccess(allBidsForThisBidid[bidderName], `ext.bidder.${whitelabelBidder}.floor`, null);
            if (flr != null) {
              adserverTargeting[whitelabelPrefix + '_' + bidderName + '_flr'] = flr;
            }
            let rid = deepAccess(allBidsForThisBidid[bidderName], `ext.bidder.${whitelabelBidder}.ruleId`, null);
            if (rid != null) {
              adserverTargeting[whitelabelPrefix + '_' + bidderName + '_rid'] = rid;
            }
            if (bidderName.match(/^ozappnexus/)) {
              adserverTargeting[whitelabelPrefix + '_' + bidderName + '_sid'] = String(allBidsForThisBidid[bidderName].cid);
            }
            // 20250211 - labels returned (array)
            labels = deepAccess(allBidsForThisBidid[bidderName], 'ext.prebid.labels', null);
            if (labels) {
              adserverTargeting[whitelabelPrefix + '_' + bidderName + '_labels'] = labels.join(',');
            }
          });
        } else {
          let perBidInfo = `${whitelabelBidder}.enhancedAdserverTargeting is set to false. No per-bid keys will be sent to adserver.`;
          if (useOzWhitelistAdserverKeys) {
            logWarn(`Your adserver keys whitelist will be ignored - ${perBidInfo}`);
          } else {
            logInfo(perBidInfo);
          }
        }
        // also add in the winning bid, to be sent to dfp
        let {seat: winningSeat, bid: winningBid} = ozoneGetWinnerForRequestBid(thisBid.bidId, serverResponse.seatbid);
        // ensure width etc is in place
        winningBid = ozoneAddStandardProperties(winningBid, defaultWidth, defaultHeight);

        adserverTargeting[whitelabelPrefix + '_auc_id'] = String(aucId); // was request.bidderRequest.auctionId
        adserverTargeting[whitelabelPrefix + '_winner'] = String(winningSeat);
        adserverTargeting[whitelabelPrefix + '_bid'] = 'true';
        // add the cache targeting id because we can't set hb_cache_id - this is overridden by prebid core
        adserverTargeting[whitelabelPrefix + '_cache_id'] = deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_id', 'no-id');
        adserverTargeting[whitelabelPrefix + '_uuid'] = deepAccess(thisBid, 'ext.prebid.targeting.hb_uuid', 'no-id');

        if (enhancedAdserverTargeting) {
          // 20250211 - labels returned (array)
          labels = deepAccess(winningBid, 'ext.prebid.labels', null);
          if (labels) {
            adserverTargeting[whitelabelPrefix + '_labels'] = labels.join(',');
          }
          adserverTargeting[whitelabelPrefix + '_imp_id'] = String(winningBid.impid);
          adserverTargeting[whitelabelPrefix + '_pb_v'] = OZONEVERSION;
          adserverTargeting[whitelabelPrefix + '_pb'] = winningBid.price;
          adserverTargeting[whitelabelPrefix + '_pb_r'] = getRoundedBid(winningBid.price, bidType);
          adserverTargeting[whitelabelPrefix + '_adId'] = String(winningBid.adId);
          adserverTargeting[whitelabelPrefix + '_size'] = `${winningBid.width}x${winningBid.height}`;
        }
        if (useOzWhitelistAdserverKeys) { // delete any un-whitelisted keys
          logInfo('Filtering out adserver targeting keys not in the whitelist: ', ozWhitelistAdserverKeys);
          Object.keys(adserverTargeting).forEach(function(key) { if (ozWhitelistAdserverKeys.indexOf(key) === -1) { delete adserverTargeting[key]; } });
        }
        thisBid.adserverTargeting = adserverTargeting;
        arrAllBids.push(thisBid);
      }
    }

    let ret = arrAllBids;
    // before returning - decide - was this a fledge-type auction (ae=1)?

    // openx type of implementation
    // let fledgeAuctionConfigs = utils.deepAccess(serverResponse, 'ext.fledge_auction_configs'); // we will need to adjust this to where ozone puts the object
    // if (fledgeAuctionConfigs) {
    //   fledgeAuctionConfigs = Object.entries(fledgeAuctionConfigs).map(([bidId, cfg]) => {
    //     return {
    //       bidId,
    //       config: mergeDeep(Object.assign({}, cfg), {
    //         auctionSignals: {
    //           ortb2Imp: this.getBidRequestForBidId(bidId, request.bidderRequest.bids) /* this is the bid object; {banner/video, ext, id, placement, secure, tagid} */
    //           // ortb2Imp: context.impContext[bidId]?.imp, /* from openx: this is literally the imp object for this bid */
    //         },
    //       }),
    //     }
    //   });
    //   ret = {
    //     bids: arrAllBids,
    //     fledgeAuctionConfigs,
    //   }
    // }

    // ix type of implementation - this is more like what ozone want to do - don't modify the auctionConfigs
    // let fledgeAuctionConfigs = deepAccess(serverResponse, 'ext.protectedAudienceAuctionConfigs') || [];
    let fledgeAuctionConfigs = deepAccess(serverResponse, 'ext.igi') || []; // 20240606 standardising
    if (isArray(fledgeAuctionConfigs) && fledgeAuctionConfigs.length > 0) {
      // Validate and filter fledgeAuctionConfigs
      fledgeAuctionConfigs = fledgeAuctionConfigs.filter(config => {
        if (!this.isValidAuctionConfig(config)) {
          logWarn('Removing malformed fledge auction config:', config);
          return false;
        }
        return true;
      });
      ret = {
        bids: arrAllBids,
        fledgeAuctionConfigs,
      };
    }

    let endTime = new Date().getTime();

    logInfo(`interpretResponse going to return at time ${endTime} (took ${endTime - startTime}ms) Time from buildRequests Start -> interpretRequests End = ${endTime - this.propertyBag.buildRequestsStart}ms`);
    logInfo('will return: ', deepClone(ret)); // this is ok to log because the renderer has not been attached yet
    return ret;
  },
  /**
   * Checks if auction config is valid
   * @param {object} config
   * @returns bool
   */
  isValidAuctionConfig(config) {
    return typeof config === 'object' && config !== null;
  },
  /**
   * brought in from the 2.7.0 test instream branch, this is needed for instream video
   * Common code to set [bid].mediaType to eg. VIDEO or BANNER. This is necessary for instream, likely other things too
   * @param thisBid object (by reference)
   * @param mediaType string
   */
  setBidMediaTypeIfNotExist(thisBid, mediaType) {
    if (!thisBid.hasOwnProperty('mediaType')) {
      logInfo(`setting thisBid.mediaType = ${mediaType}`);
      thisBid.mediaType = mediaType;
    } else {
      logInfo(`found value for thisBid.mediaType: ${thisBid.mediaType}`);
    }
  },
  /**
   * Use this to get all config values
   * Now it's getting complicated with whitelabeling, this simplifies the code for getting config values.
   * eg. to get whitelabelled version you just sent the ozone default string like ozone.oz_omp_floor
   * @param ozoneVersion string like 'ozone.oz_omp_floor'
   * @returns {string|object}
   */
  getWhitelabelConfigItem(ozoneVersion) {
    if (this.propertyBag.whitelabel.bidder === 'ozone') { return config.getConfig(ozoneVersion); }
    let whitelabelledSearch = ozoneVersion.replace('ozone', this.propertyBag.whitelabel.bidder);
    whitelabelledSearch = whitelabelledSearch.replace('oz_', this.propertyBag.whitelabel.keyPrefix + '_');
    // logInfo('Getting whitelabel config item for : ' + whitelabelledSearch);
    return config.getConfig(whitelabelledSearch);
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
  // 20240507 - add gppPrivacy - this will come through when you build with --modules=consentManagementGpp
  getUserSyncs(optionsType, serverResponse, gdprConsent, usPrivacy, gppConsent = {}) {
    logInfo('getUserSyncs optionsType', optionsType, 'serverResponse', serverResponse, 'gdprConsent', gdprConsent, 'usPrivacy', usPrivacy, 'cookieSyncBag', this.cookieSyncBag);
    if (!serverResponse || serverResponse.length === 0) {
      return [];
    }
    let { gppString = '', applicableSections = [] } = gppConsent;
    if (optionsType.iframeEnabled) {
      var arrQueryString = [];
      if (config.getConfig('debug')) {
        arrQueryString.push('pbjs_debug=true');
      }
      arrQueryString.push('gdpr=' + (deepAccess(gdprConsent, 'gdprApplies', false) ? '1' : '0'));
      arrQueryString.push('gdpr_consent=' + deepAccess(gdprConsent, 'consentString', ''));
      arrQueryString.push('usp_consent=' + (usPrivacy || ''));
      // NOTE GPP support in CMPs is not yet properly available for testing
      arrQueryString.push('gpp=' + gppString);
      if (isArray(applicableSections)) {
        arrQueryString.push(`gpp_sid=${applicableSections.join()}`);
      }

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
      arrQueryString.push('bidder=' + this.propertyBag.whitelabel.bidder);

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
   * @returns object|null
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
   * @returns string|null
   */
  getVideoContextForBidId(bidId, arrBids) {
    let requestBid = this.getBidRequestForBidId(bidId, arrBids);
    if (requestBid != null) {
      return deepAccess(requestBid, 'mediaTypes.video.context', 'unknown')
    }
    return null;
  },
  /**
   * Taking over from findAllUserIds - Pat 20240604
   * This is used for cookie sync, not auction call
   * Look for pubcid & all the other IDs according to http://prebid.org/dev-docs/modules/userId.html
   *  @returns map
   */
  findAllUserIdsFromEids(bidRequest) {
    // much simpler code, iterate over eids BUT note that eids have different keys
    // see the table on https://docs.prebid.org/dev-docs/modules/userId.html
    let ret = {};
    if (!bidRequest.hasOwnProperty('userIdAsEids')) {
      logInfo('findAllUserIdsFromEids - no bidRequest.userIdAsEids object was found on the bid!');
      this.tryGetPubCidFromOldLocation(ret, bidRequest); // legacy
      return ret;
    }
    // note - removed the keymap. We are no longer mapping the eid ID back to being userId
    /**
     * userIdAsEids =
     * [{
     *     "source": "pubcid.org",
     *     "uids": [
     *         {
     *             "id": "9fad6177-28a7-4e37-8f41-ef1e350ba6c0",
     *             "atype": 1
     *         }
     *     ]
     * }, ... ]
     */
    for (let obj of bidRequest.userIdAsEids) {
      ret[obj.source] = deepAccess(obj, 'uids.0.id');
    }
    this.tryGetPubCidFromOldLocation(ret, bidRequest); // legacy
    return ret;
  },
  tryGetPubCidFromOldLocation(ret, bidRequest) {
    if (!ret.hasOwnProperty('pubcid')) {
      let pubcid = deepAccess(bidRequest, 'crumbs.pubcid');
      if (pubcid) {
        ret['pubcid.org'] = pubcid; // if built with old pubCommonId module (use the new eid key)
      }
    }
  },
  /**
   * Convenient method to get the value we need for the placementId - ONLY from the bidRequest - NOT taking into account any GET override ID
   * @param bidRequest
   * @returns string
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
    let whitelabelPrefix = this.propertyBag.whitelabel.keyPrefix;
    let arr = this.getGetParametersAsObject();
    if (arr.hasOwnProperty(whitelabelPrefix + 'storedrequest')) {
      if (this.isValidPlacementId(arr[whitelabelPrefix + 'storedrequest'])) {
        logInfo(`using GET ${whitelabelPrefix}storedrequest=` + arr[whitelabelPrefix + 'storedrequest'] + ' to replace placementId');
        return arr[whitelabelPrefix + 'storedrequest'];
      } else {
        logError(`GET ${whitelabelPrefix}storedrequest FAILED VALIDATION - will not use it`);
      }
    }
    return null;
  },
  // Try to use this as the mechanism for reading GET params because it's easy to mock it for tests
  getGetParametersAsObject() {
    let parsed = parseUrl(getRefererInfo().location);
    logInfo('getGetParametersAsObject found:', parsed.search);
    return parsed.search;
  },

  /**
   * Do we have to block this request? Could be due to config values (no longer checking gdpr)
   * @returns {boolean|*[]} true = block the request, else false
   */
  blockTheRequest() {
    // if there is an ozone.oz_request = false then quit now.
    let ozRequest = this.getWhitelabelConfigItem('ozone.oz_request');
    if (ozRequest === false) {
      logWarn(`Will not allow the auction : ${this.propertyBag.whitelabel.keyPrefix}_request is set to false`);
      return true;
    }
    return false;
  },
  /**
   * This returns a random ID for this page in a specific format. It starts off with the current ms timestamp then appends a random component
   * @returns {string}
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
    // let storage = getStorageManager(this.gvlid, 'ozone');
    // if (storage.localStorageIsEnabled()) {
    //   storage.setDataInLocalStorage('ozone_pv', this.propertyBag.pageId);
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
   * @returns {*}
   * @private
   */
  _unpackVideoConfigIntoIABformat(ret, objConfig) {
    // @todo 20250310 i propose to remove placement - all it does is causes no outstream bids to be returned. Everyone should be using plcmt
    let arrVideoKeysAllowed = ['mimes', 'minduration', 'maxduration', 'protocols', 'w', 'h', 'startdelay', 'placement', 'plcmt', 'linearity', 'skip', 'skipmin', 'skipafter', 'sequence', 'battr', 'maxextended', 'minbitrate', 'maxbitrate', 'boxingallowed', 'playbackmethod', 'playbackend', 'delivery', 'pos', 'companionad', 'api', 'companiontype'];
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
      if (ret.hasOwnProperty('ext')) {
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
   * @returns {*}
   * @private
   */
  _addVideoDefaults(objRet, objConfig, addIfMissing) {
    // add inferred values & any default values we want.
    let placementValue = this.getVideoPlacementValue(deepAccess(objConfig, 'context'));
    if (placementValue) {
      objRet.placement = placementValue;
    }
    // 20240610 removed - Pat request
    // if (context === 'outstream') {
    //   objRet.placement = 3;
    // } else if (context === 'instream') {
    //   objRet.placement = 1;
    // }

    let skippable = deepAccess(objConfig, 'skippable', null);
    if (skippable == null) {
      if (addIfMissing && !objRet.hasOwnProperty('skip')) {
        objRet.skip = 0;
      }
    } else {
      objRet.skip = skippable ? 1 : 0;
    }
    return objRet;
  },
  // NOTE we can't stringify bid object in prebid7 because of circular refs!
  getLoggableBidObject(bid) {
    let logObj = {
      ad: bid.ad,
      adId: bid.adId,
      adUnitCode: bid.adUnitCode,
      adm: bid.adm,
      adomain: bid.adomain,
      adserverTargeting: bid.adserverTargeting,
      auctionId: bid.auctionId,
      bidId: bid.bidId,
      bidder: bid.bidder,
      bidderCode: bid.bidderCode,
      cpm: bid.cpm,
      creativeId: bid.creativeId,
      crid: bid.crid,
      currency: bid.currency,
      h: bid.h,
      w: bid.w,
      impid: bid.impid,
      mediaType: bid.mediaType,
      params: bid.params,
      price: bid.price,
      transactionId: bid.transactionId,
      ttl: bid.ttl,
      ortb2: deepAccess(bid, 'ortb2'),
      ortb2Imp: deepAccess(bid, 'ortb2Imp'),
    };
    if (bid.hasOwnProperty('floorData')) {
      logObj.floorData = bid.floorData;
    }
    return logObj;
  }

};

/**
 * add a page-level-unique adId element to all server response bids.
 * NOTE that this is destructive - it mutates the serverResponse object sent in as a parameter
 * @param seatbid  object (serverResponse.seatbid)
 * @returns seatbid object
 */
export function injectAdIdsIntoAllBidResponses(seatbid) {
  logInfo('injectAdIdsIntoAllBidResponses', deepClone(seatbid));
  for (let i = 0; i < seatbid.length; i++) {
    let sb = seatbid[i];
    for (let j = 0; j < sb.bid.length; j++) {
      // modify the bidId per-bid, so each bid has a unique adId within this response, and dfp can select one.
      // 2020-06 we now need a second level of ID because there might be multiple identical impid's within a seatbid!
      sb.bid[j]['adId'] = `${sb.bid[j]['impid']}-${i}-${spec.propertyBag.whitelabel.keyPrefix}-${j}`;
    }
  }
  return seatbid;
}

export function checkDeepArray(Arr) {
  if (isArray(Arr)) {
    if (isArray(Arr[0])) {
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
 * Do the messy searching for the best bid response in the serverResponse.seatbid array matching the requestBid.bidId
 * @param requestBidId
 * @param serverResponseSeatBid
 * @returns {*} bid object
 */
export function ozoneGetWinnerForRequestBid(requestBidId, serverResponseSeatBid) {
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
}

/**
 * Get a list of all the bids, for this bidId. The keys in the response object will be {seatname} OR {seatname}{w}x{h} if seatname already exists
 * @param matchBidId
 * @param serverResponseSeatBid
 * @returns {} = {ozone|320x600:{obj}, ozone|320x250:{obj}, appnexus|300x250:{obj}, ... }
 */
export function ozoneGetAllBidsForBidId(matchBidId, serverResponseSeatBid, defaultWidth, defaultHeight) {
  let objBids = {};
  for (let j = 0; j < serverResponseSeatBid.length; j++) {
    let theseBids = serverResponseSeatBid[j].bid;
    let thisSeat = serverResponseSeatBid[j].seat;
    for (let k = 0; k < theseBids.length; k++) {
      if (theseBids[k].impid === matchBidId) {
        if (objBids.hasOwnProperty(thisSeat)) { // > 1 bid for an adunit from a bidder - only use the one with the highest bid
          //   objBids[`${thisSeat}${theseBids[k].w}x${theseBids[k].h}`] = theseBids[k];
          if (objBids[thisSeat]['price'] < theseBids[k].price) {
            // objBids[thisSeat] = theseBids[k];
            // ensure width etc is in place
            objBids[thisSeat] = ozoneAddStandardProperties(theseBids[k], defaultWidth, defaultHeight);
          }
        } else {
          objBids[thisSeat] = theseBids[k];
          // ensure width etc is in place
          objBids[thisSeat] = ozoneAddStandardProperties(theseBids[k], defaultWidth, defaultHeight);
        }
      }
    }
  }
  return objBids;
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
 * We expect to be able to find a standard set of properties on winning bid objects; add them here.
 * @param seatBid
 * @param defaultWidth int
 * @param defaultHeight int
 * @returns {*}
 */
export function ozoneAddStandardProperties(seatBid, defaultWidth, defaultHeight) {
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
}

/**
 *
 * @param objVideo will be like {"playerSize":[640,480],"mimes":["video/mp4"],"context":"outstream"} or POSSIBLY {"playerSize":[[640,480]],"mimes":["video/mp4"],"context":"outstream"}
 * @returns object {w,h} or null
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
      logError('getWidthAndHeightFromVideoObject found non-number/string type inside the INNER array in playerSize. This is totally wrong - cannot continue.', playerSize[0]);
      return null;
    }
  }
  if (playerSize.length !== 2) {
    logError('getWidthAndHeightFromVideoObject found playerSize with length of ' + playerSize.length + '. This is totally wrong - cannot continue.');
    return null;
  }
  return ({'w': playerSize[0], 'h': playerSize[1]});
}

/**
 * @param objVideo will be like {"playerSize":[640,480],"mimes":["video/mp4"],"context":"outstream"} or POSSIBLY {"playerSize":[[640,480]],"mimes":["video/mp4"],"context":"outstream"}
 * @returns object {w,h} or null
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
  logInfo(`newRenderer will set loaded to ${isLoaded ? 'true' : 'false'}`);
  const renderer = Renderer.install({
    url: spec.getRendererUrl(),
    config: rendererOptions,
    loaded: isLoaded,
    adUnitCode
  });
  try {
    renderer.setRender(outstreamRender);
  } catch (err) {
    logError('Prebid Error calling renderer.setRender', renderer, err);
  }
  logInfo('returning renderer object');
  return renderer;
}
// NOTE from prebid 7, we can no longer log JSON.parse(JSON.stringify(bid)) - this causes a circular reference
function outstreamRender(bid) {
  // note with prebid 7 we CANNOT stringify bid object due to circular reference ALSO the object is too big to realistically remove circular refs with eg. https://gist.github.com/saitonakamura/d51aa672c929e35cc81fa5a0e31f12a9
  logInfo('outstreamRender got', deepClone(spec.getLoggableBidObject(bid)));
  // push to render queue because ozoneVideo may not be loaded yet
  bid.renderer.push(() => {
    logInfo('outstreamRender: Going to execute window.ozoneVideo.outstreamRender');
    window.ozoneVideo.outstreamRender(bid);
  });
}

registerBidder(spec);
logInfo(`*BidAdapter ${OZONEVERSION} was loaded`);
