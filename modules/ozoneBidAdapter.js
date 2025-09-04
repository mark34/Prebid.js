import {
  logInfo,
  logError,
  deepAccess,
  logWarn,
  deepSetValue,
  isArray,
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
import {toOrtb25} from '../libraries/ortb2.5Translator/translator.js';
const BIDDER_CODE = 'ozone';
// --- START REMOVE FOR RELEASE

// To remove this : php removecomments.php

/*
GET parameters (20250619):
pbjs_debug=true
oztestmode=1
ozstoredrequest=8000000328
batchRequests=n
 */

// NOTE THAT the gvl is available at https://iabeurope.eu/vendor-list-tcf-v2-0/

// *** DEV-ozpr
// const ORIGIN = 'https://test-pub.ozpr.net';
// const ORIGIN = 'https://test.ozpr.net'; // to do a dev build, just uncomment this line & comment out the prod one
// const AUCTIONURI = '/openrtb2/auction';
// const OZONECOOKIESYNC = 'https://test.ozpr.net/static/load-cookie.html';
// const OZONE_RENDERER_URL = 'https://prebid.the-ozone-project.com/ozone-renderer.js';

// *** DEV-afsheen
// const AUCTIONURI = 'http://afsheen-dev.the-ozone-project.com/openrtb2/auction';
// const OZONECOOKIESYNC = 'http://afsheen-dev.the-ozone-project.com/static/load-cookie.html';
// const OZONE_RENDERER_URL = 'https://prebid.the-ozone-project.com/ozone-renderer.js';
// --- END REMOVE FOR RELEASE

const ORIGIN = 'https://elb.the-ozone-project.com'; // applies only to auction & cookie
const AUCTIONURI = '/openrtb2/auction';
const OZONECOOKIESYNC = '/static/load-cookie.html';
const OZONE_RENDERER_URL = 'https://prebid.the-ozone-project.com/ozone-renderer.js';
const KEY_PREFIX = 'oz';
const OZONEVERSION = '4.0.2';
export const spec = {
  // can be added for testing - maybe that onAdRenderSucceeded might be useful for tracking.
  // onBidWon: function(bid, options) { LogInfo('onBidWon', JSON.stringify(bid) ); },
  // onBidBillable: function(bid, options) { LogInfo('onBidBillable', JSON.stringify(bid)); },
  // onAdRenderSucceeded: function(bid, options) { LogInfo('onAdRenderSucceeded', JSON.stringify(bid)); },
  // onTimeout: function(timeoutData, options) { LogInfo('onTimeout', JSON.stringify(timeoutData)); },
  // onBidderError: function(args, options) { LogInfo('onBidderError', JSON.stringify(args)); },

  gvlid: 524,
  version: OZONEVERSION,
  code: BIDDER_CODE,
  supportedMediaTypes: [VIDEO, BANNER],
  cookieSyncBag: {publisherId: null, siteId: null, userIdObject: {}},
  propertyBag: {pageId: null, buildRequestsStart: 0, buildRequestsEnd: 0},
  getAuctionUrl() {
    const ep = config.getConfig('ozone.endpointOverride') || {};
    if (ep.auctionUrl) return ep.auctionUrl;
    const origin = ep.origin || ORIGIN;
    return origin + AUCTIONURI;
  },
  getCookieSyncUrl() {
    const ep = config.getConfig('ozone.endpointOverride') || {};
    if (ep.cookieSyncUrl) return ep.cookieSyncUrl;
    const origin = ep.origin || ORIGIN;
    return origin + OZONECOOKIESYNC;
  },
  getRendererUrl() {
    const ep = config.getConfig('ozone.endpointOverride') || {};
    return ep.rendererUrl || OZONE_RENDERER_URL;
  },
  /**
   * get the value to use for `placement` or null (don't set placement value)
   * Do not allow arbitrary strings
   * @param context string  is 'outstream' or 'instream'
   */
  getVideoPlacementValue(context) {
    if (['instream', 'outstream'].indexOf(context) < 0) return null;
    return deepAccess(config.getConfig('ozone.videoParams'), context);
  },
  /**
   * Return value of false means don't batch. Otherwise batch to the number returned.
   * @returns boolean|int
   */
  getBatchRequests() {
    // is there a GET override?
    const g = this.getGetParametersAsObject();
    if (g['batchRequests'] && g['batchRequests'].toString().match(/^[0-9]+$/)) {
      return parseInt(g['batchRequests']);
    }
    const batch = config.getConfig('ozone.batchRequests');
    if (batch === true) return 10;
    if (typeof batch === 'number' && batch > 0) {
      return batch;
    }
    return false;
  },
  isBidRequestValid(bid) {
    const vf = 'VALIDATION FAILED';
    logInfo('isBidRequestValid : ', config.getConfig(), bid);
    const adUnitCode = bid.adUnitCode;
    const err1 = `${vf} : missing {param} : siteId, placementId and publisherId are REQUIRED`;
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
    if (!(bid.params.publisherId).toString().match(/^[a-zA-Z0-9-]{12}$/)) {
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
    this.propertyBag.buildRequestsStart = new Date().getTime();
    const bidderKey = BIDDER_CODE;
    const prefix = KEY_PREFIX;
    logInfo(`buildRequests time: ${this.propertyBag.buildRequestsStart} v ${OZONEVERSION} validBidRequests`, deepClone(validBidRequests), 'bidderRequest', deepClone(bidderRequest));
    // First check - is there any config to block this request?
    if (this.blockTheRequest()) {
      return [];
    }
    // detect if FLEDGE is enabled:
    const fledgeEnabled = !!bidderRequest.fledgeEnabled; // IF true then this is added as each bid[].ext.ae=1
    let htmlParams = {'publisherId': '', 'siteId': ''};
    if (validBidRequests.length > 0) {
      Object.assign(this.cookieSyncBag.userIdObject, this.findAllUserIdsFromEids(validBidRequests[0]));
      this.cookieSyncBag.siteId = deepAccess(validBidRequests[0], 'params.siteId');
      this.cookieSyncBag.publisherId = deepAccess(validBidRequests[0], 'params.publisherId');
      htmlParams = validBidRequests[0].params;
    }
    logInfo('cookie sync bag', this.cookieSyncBag);
    let singleRequest = config.getConfig('ozone.singleRequest');
    singleRequest = singleRequest !== false; // undefined & true will be true
    // we only want to set specific properties on this, not validBidRequests[0].param
    const ozoneRequest = {};
    // First party data module : look for ortb2 in setconfig & set the User object. NOTE THAT this should happen before we set the consentString
    // NOTE - see https://docs.prebid.org/features/firstPartyData.html
    const fpd = deepAccess(bidderRequest, 'ortb2', null);
    logInfo('got ortb2 fpd: ', fpd);
    if (fpd && deepAccess(fpd, 'user')) {
      logInfo('added FPD user object');
      ozoneRequest.user = fpd.user;
    }
    const getParams = this.getGetParametersAsObject();
    const wlOztestmodeKey = 'oztestmode';
    const isTestMode = getParams[wlOztestmodeKey] || null; // this can be any string, it's used for testing ads
    ozoneRequest.device = bidderRequest?.ortb2?.device || {}; // 20240925 rupesh changed this
    const placementIdOverrideFromGetParam = this.getPlacementIdOverrideFromGetParam(); // null or string
    // build the array of params to attach to `imp`
    let schain = null;
    var auctionId = deepAccess(validBidRequests, '0.ortb2.source.tid');
    if (auctionId === '0') {
      auctionId = null;
    }
    const tosendtags = validBidRequests.map(ozoneBidRequest => {
      var obj = {};
      const placementId = placementIdOverrideFromGetParam || this.getPlacementId(ozoneBidRequest);
      obj.id = ozoneBidRequest.bidId;
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
            const childConfig = deepAccess(ozoneBidRequest, 'params.video', {});
            obj.video = this.unpackVideoConfigIntoIABformat(ozoneBidRequest.mediaTypes[VIDEO], childConfig);
            obj.video = this.addVideoDefaults(obj.video, ozoneBidRequest.mediaTypes[VIDEO], childConfig);
          }
          // we need to duplicate some of the video values
          const wh = getWidthAndHeightFromVideoObject(obj.video);
          logInfo(`setting video object ${obj.id} from mediaTypes.video: `, obj.video, 'wh=', wh);
          const settingToBe = 'setting obj.video.format to be '; // partial, reusable phrase
          if (wh && typeof wh === 'object') {
            obj.video.w = wh['w'];
            obj.video.h = wh['h'];
            // this should never happen; it was in the original spec for this change though.
            const ps = getPlayerSizeFromObject(obj.video);
            if (ps && Array.isArray(ps[0])) {
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
      obj.placementId = placementId;
      // build the imp['ext'] object - NOTE - Dont obliterate anything that's already in obj.ext
      deepSetValue(obj, 'ext.prebid', {'storedrequest': {'id': placementId}});
      obj.ext[bidderKey] = {};
      obj.ext[bidderKey].adUnitCode = ozoneBidRequest.adUnitCode; // eg. 'mpu'
      if (ozoneBidRequest.params.hasOwnProperty('customData')) {
        obj.ext[bidderKey].customData = ozoneBidRequest.params.customData;
      }
      // 20250114 - optional ozFloor param in adunits - for users who don't want to use the floors module. Send this up as imp[].ext.ozone.ozFloor
      if (ozoneBidRequest.params.hasOwnProperty('ozFloor')) {
        const ozFloorParsed = parseFloat(ozoneBidRequest.params.ozFloor);
        if (!isNaN(ozFloorParsed)) {
          obj.ext[bidderKey].ozFloor = ozFloorParsed;
        } else {
          logError(`Ignoring invalid ozFloor value for adunit code: ${ozoneBidRequest.adUnitCode}`);
        }
      }
      logInfo(`obj.ext.${bidderKey} is `, obj.ext[bidderKey]);
      if (isTestMode != null) {
        logInfo(`setting isTestMode: ${isTestMode}`);
        if (obj.ext[bidderKey].hasOwnProperty('customData')) {
          for (let i = 0; i < obj.ext[bidderKey].customData.length; i++) {
            obj.ext[bidderKey].customData[i]['targeting'][wlOztestmodeKey] = isTestMode;
          }
        } else {
          obj.ext[bidderKey].customData = [{'settings': {}, 'targeting': {}}];
          obj.ext[bidderKey].customData[0].targeting[wlOztestmodeKey] = isTestMode;
        }
      }
      if (fpd && deepAccess(fpd, 'site')) {
        logInfo('adding fpd.site');
        if (deepAccess(obj, `ext.${bidderKey}.customData.0.targeting`, false)) {
          Object.assign(obj.ext[bidderKey].customData[0].targeting, fpd.site);
        } else {
          deepSetValue(obj, `ext.${bidderKey}.customData.0.targeting`, fpd.site);
        }
      }
      // pat's changes included moving where we look for schain
      // if (!schain && deepAccess(ozoneBidRequest, 'schain')) {
      //  schain = ozoneBidRequest.schain;
      // }
      if (!schain && deepAccess(ozoneBidRequest, 'ortb2.source.ext.schain')) {
        schain = ozoneBidRequest.ortb2.source.ext.schain;
      }
      // gpid 20230620. If prebid has been compiled with gptPreAuction module then set the gpid in the required location
      // https://docs.xandr.com/bundle/industry-reference/page/publisher-best-practices-for-the-trade-desk.html
      const gpid = deepAccess(ozoneBidRequest, 'ortb2Imp.ext.gpid');
      if (gpid) {
        deepSetValue(obj, 'ext.gpid', gpid);
      }
      const transactionId = deepAccess(ozoneBidRequest, 'ortb2Imp.ext.tid');
      if (transactionId) {
        obj.ext.tid = transactionId; // this is the transactionId PER adUnit, common across bidders for this unit. Changed to tid 20250617. moved up out of .ozone. 20250624
      }
      if (auctionId) {
        obj.ext.auctionId = auctionId; // we were sent a valid auctionId to use - this will also be used as the root id value for the request. moved up out of .ozone. 20250624
      }
      // 20240227 - adding support for fledge
      if (fledgeEnabled) { // fledge is enabled at some config level - pbjs.setBidderConfig or pbjs.setConfig
        const auctionEnvironment = deepAccess(ozoneBidRequest, 'ortb2Imp.ext.ae'); // this will be set for one of 3 reasons; adunit, setBidderConfig, setConfig
        if (isInteger(auctionEnvironment)) {
          deepSetValue(obj, 'ext.ae', auctionEnvironment);
        } else {
          logError(`ignoring ortb2Imp.ext.ae - not an integer for obj.id=${obj.id}`);
        }
      }
      return obj;
    });
    // in v 2.0.0 we moved these outside of the individual ad slots
    const extObj = {};
    extObj[bidderKey] = {};
    extObj[bidderKey][`${prefix}_pb_v`] = OZONEVERSION;
    extObj[bidderKey][`${prefix}_rw`] = placementIdOverrideFromGetParam ? 1 : 0;
    if (validBidRequests.length > 0) {
      const userIds = this.cookieSyncBag.userIdObject; // 2021-01-06 - slight optimisation - we've already found this info
      if (userIds.hasOwnProperty('pubcid.org')) {
        extObj[bidderKey].pubcid = userIds['pubcid.org'];
      }
    }
    extObj[bidderKey].pv = this.getPageId(); // attach the page ID that will be common to all auction calls for this page if refresh() is called
    const ozOmpFloorDollars = config.getConfig('ozone.oz_omp_floor'); // valid only if a dollar value (typeof == 'number')
    logInfo(`${prefix}_omp_floor dollar value = `, ozOmpFloorDollars);
    if (typeof ozOmpFloorDollars === 'number') {
      extObj[bidderKey][`${prefix}_omp_floor`] = ozOmpFloorDollars;
    } else if (typeof ozOmpFloorDollars !== 'undefined') {
      logError(`IF set, ${prefix}_omp_floor must be a number eg. 1.55. Found:` + (typeof ozOmpFloorDollars));
    }
    const ozWhitelistAdserverKeys = config.getConfig('ozone.oz_whitelist_adserver_keys');
    const useOzWhitelistAdserverKeys = isArray(ozWhitelistAdserverKeys) && ozWhitelistAdserverKeys.length > 0;
    extObj[bidderKey][prefix + '_kvp_rw'] = useOzWhitelistAdserverKeys ? 1 : 0;
    const endpointOverride = config.getConfig('ozone.endpointOverride');
    if (endpointOverride?.origin || endpointOverride?.auctionUrl) {
      extObj[bidderKey].origin = endpointOverride.auctionUrl || endpointOverride.origin;
    }
    // extObj.ortb2 = config.getConfig('ortb2'); // original test location
    // 20220628 - got rid of special treatment for adserver.org
    const userExtEids = deepAccess(validBidRequests, '0.userIdAsEids', []); // generate the UserIDs in the correct format for UserId module
    ozoneRequest.site = {
      'publisher': {'id': htmlParams.publisherId},
      'page': getRefererInfo().page,
      'id': htmlParams.siteId
    };
    ozoneRequest.test = config.getConfig('debug') ? 1 : 0;
    if (bidderRequest && bidderRequest.gdprConsent) {
      logInfo('ADDING GDPR');
      const apiVersion = deepAccess(bidderRequest, 'gdprConsent.apiVersion', 1);
      ozoneRequest.regs = {ext: {gdpr: bidderRequest.gdprConsent.gdprApplies ? 1 : 0, apiVersion: apiVersion}};
      if (deepAccess(ozoneRequest, 'regs.ext.gdpr')) {
        deepSetValue(ozoneRequest, 'user.ext.consent', bidderRequest.gdprConsent.consentString);
      } else {
        logWarn('**** Strange CMP info: bidderRequest.gdprConsent exists BUT bidderRequest.gdprConsent.gdprApplies is false. See bidderRequest logged above. ****');
      }
    } else {
      logInfo('WILL NOT ADD GDPR info; no bidderRequest.gdprConsent object');
    }
    // this should come as late as possible so it overrides any user.ext.consent value
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
      deepSetValue(ozoneRequest, 'regs.ext.gpp', bidderRequest.ortb2.regs.gpp);
      deepSetValue(ozoneRequest, 'regs.ext.gpp_sid', bidderRequest.ortb2.regs.gpp_sid);
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
    extObj[bidderKey].cookieDeprecationLabel = deepAccess(bidderRequest, 'ortb2.device.ext.cdep', 'none');
    logInfo(`cookieDeprecationLabel ortb2.device.ext.cdep = ${extObj[bidderKey].cookieDeprecationLabel}`);

    /*
    For a bid request, no matter whether single, batch or non-single:
====================++==============================++===========
id = unique random, always
source.tid AND imp[].ext.ozone.auctionId = auctionId (validBidRequests[].ortb2.source.tid) if pub opts in & it is set
imp[].ext.ozone.transactionId = transactionId (validBidRequests[].ortb2Imp.ext.tid) if pub opts in & it is set
     */
    // are we to batch the requests (used by reach)
    const batchRequestsVal = this.getBatchRequests(); // false|numeric
    if (typeof batchRequestsVal === 'number') {
      logInfo(`Batching = ${batchRequestsVal}`);
      const arrRet = []; // return an array of objects containing data describing max 10 bids
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
        toOrtb25(ozoneRequest);
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
      toOrtb25(ozoneRequest);
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
    const arrRet = tosendtags.map(imp => {
      logInfo('non-single response, working on imp : ', imp);
      const ozoneRequestSingle = Object.assign({}, ozoneRequest);
      ozoneRequestSingle.id = generateUUID(); // Unique ID of the bid request, provided by the exchange. (REQUIRED)
      ozoneRequestSingle.imp = [imp];
      ozoneRequestSingle.ext = extObj;
      deepSetValue(ozoneRequestSingle, 'user.ext.eids', userExtEids);
      // https://www.iab.com/wp-content/uploads/2016/03/OpenRTB-API-Specification-Version-2-5-FINAL.pdf
      if (auctionId) {
        deepSetValue(ozoneRequestSingle, 'source.tid', auctionId);
      }
      toOrtb25(ozoneRequestSingle);
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
    const ret = {};
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
   * Note that in singleRequest mode this will be called once, else it will be called for each adSlot's response
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
    const startTime = new Date().getTime();
    const bidderKey = BIDDER_CODE;
    const prefix = KEY_PREFIX;
    logInfo(`interpretResponse time: ${startTime} . Time between buildRequests done and interpretResponse start was ${startTime - this.propertyBag.buildRequestsEnd}ms`);
    logInfo(`serverResponse, request`, deepClone(serverResponse), deepClone(request));
    serverResponse = serverResponse.body || {};
    const aucId = serverResponse.id; // this will be correct for single requests and non-single
    // note that serverResponse.id value is the auction_id we might want to use for reporting reasons.
    if (!serverResponse.hasOwnProperty('seatbid')) {
      return [];
    }
    if (typeof serverResponse.seatbid !== 'object') {
      return [];
    }
    const arrAllBids = [];
    let labels;
    let enhancedAdserverTargeting = config.getConfig('ozone.enhancedAdserverTargeting');
    logInfo('enhancedAdserverTargeting', enhancedAdserverTargeting);
    if (typeof enhancedAdserverTargeting == 'undefined') {
      enhancedAdserverTargeting = true;
    }
    logInfo('enhancedAdserverTargeting', enhancedAdserverTargeting);
    // 2021-03-05 - comment this out for a build without adding adid to the response
    serverResponse.seatbid = injectAdIdsIntoAllBidResponses(serverResponse.seatbid); // we now make sure that each bid in the bidresponse has a unique (within page) adId attribute.
    serverResponse.seatbid = this.removeSingleBidderMultipleBids(serverResponse.seatbid);
    const ozOmpFloorDollars = config.getConfig('ozone.oz_omp_floor'); // valid only if a dollar value (typeof == 'number')
    const addOzOmpFloorDollars = typeof ozOmpFloorDollars === 'number';
    const ozWhitelistAdserverKeys = config.getConfig('ozone.oz_whitelist_adserver_keys');
    const useOzWhitelistAdserverKeys = isArray(ozWhitelistAdserverKeys) && ozWhitelistAdserverKeys.length > 0;
    //
    for (let i = 0; i < serverResponse.seatbid.length; i++) {
      const sb = serverResponse.seatbid[i];
      for (let j = 0; j < sb.bid.length; j++) {
        const thisRequestBid = this.getBidRequestForBidId(sb.bid[j].impid, request.bidderRequest.bids);
        logInfo(`seatbid:${i}, bid:${j} Going to set default w h for seatbid/bidRequest`, sb.bid[j], thisRequestBid);
        // ensure width etc is in place
        const {defaultWidth, defaultHeight} = defaultSize(thisRequestBid);
        const thisBid = ozoneAddStandardProperties(sb.bid[j], defaultWidth, defaultHeight);
        // prebid 4.0 compliance
        thisBid.meta = {advertiserDomains: thisBid.adomain || []};
        let videoContext = null;
        let isVideo = false;
        const bidType = deepAccess(thisBid, 'ext.prebid.type');
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
            thisBid.vastXml = thisBid.adm;
          } else {
            logInfo('not an outstream video (presumably instream), will set thisBid.mediaType = VIDEO and thisBid.vastUrl and not attach a renderer');
            // prebid core sends this as 'description_url' which is not useful for vast tag param placeholders
            // 20250325 change id=hb_cache_id to uuid=hb_uuid
            thisBid.vastUrl = `https://${deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_host', 'missing_host')}${deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_path', 'missing_path')}?uuid=${deepAccess(thisBid, 'ext.prebid.targeting.hb_uuid', 'missing_uuid')}`; // need to see if this works ok for ozone
            // thisBid.vastXml = thisBid.adm; // this needs the cache config in-page
            // add hb_cache_... keys/values to the server targeting
            // 20220525 - this could be set by the auction endpoint, but however it's set, it gets prebid (auction.js) to add the targeting key hb_uuid which is used on the adserver to locate the cached ad
            if (!thisBid.hasOwnProperty('videoCacheKey')) {
              const videoCacheUuid = deepAccess(thisBid, 'ext.prebid.targeting.hb_uuid', 'no_hb_uuid');
              logInfo(`Adding videoCacheKey: ${videoCacheUuid}`);
              thisBid.videoCacheKey = videoCacheUuid;
            } else {
              logInfo('videoCacheKey already exists on the bid object, will not add it');
            }
          }
        } else {
          // must be a banner
          this.setBidMediaTypeIfNotExist(thisBid, BANNER);
        }
        // adding the cache keys & other
        adserverTargeting = Object.assign(adserverTargeting, deepAccess(thisBid, 'ext.prebid.targeting', {}));
        if (enhancedAdserverTargeting) {
          // add all the winning & non-winning bids for this bidId:
          // NOTE - string concatenation for multiple vars is (slightly) faster than templating : https://stackoverflow.com/questions/29055518/are-es6-template-literals-faster-than-string-concatenation
          const allBidsForThisBidid = ozoneGetAllBidsForBidId(thisBid.bidId, serverResponse.seatbid, defaultWidth, defaultHeight);
          logInfo('Going to iterate allBidsForThisBidId', deepClone(allBidsForThisBidid));
          Object.keys(allBidsForThisBidid).forEach((seat, index, ar2) => {
            logInfo(`adding adserverTargeting for ${seat} for bidId ${thisBid.bidId}`);
            adserverTargeting[prefix + '_' + seat] = seat;
            adserverTargeting[prefix + '_' + seat + '_crid'] = String(allBidsForThisBidid[seat].crid);
            adserverTargeting[prefix + '_' + seat + '_adv'] = String(allBidsForThisBidid[seat].adomain);
            adserverTargeting[prefix + '_' + seat + '_adId'] = String(allBidsForThisBidid[seat].adId);
            adserverTargeting[prefix + '_' + seat + '_pb_r'] = getRoundedBid(allBidsForThisBidid[seat].price, allBidsForThisBidid[seat].ext.prebid.type);
            adserverTargeting[prefix + '_' + seat + '_size'] = String(allBidsForThisBidid[seat].width) + 'x' + String(allBidsForThisBidid[seat].height);
            if (allBidsForThisBidid[seat].hasOwnProperty('dealid')) {
              adserverTargeting[prefix + '_' + seat + '_dealid'] = String(allBidsForThisBidid[seat].dealid);
            }
            if (addOzOmpFloorDollars) {
              adserverTargeting[prefix + '_' + seat + '_omp'] = allBidsForThisBidid[seat].price >= ozOmpFloorDollars ? '1' : '0';
            }
            if (isVideo) {
              adserverTargeting[prefix + '_' + seat + '_vid'] = videoContext; // outstream or instream
            }
            const flr = deepAccess(allBidsForThisBidid[seat], `ext.bidder.${bidderKey}.floor`, null);
            if (flr != null) {
              adserverTargeting[prefix + '_' + seat + '_flr'] = flr;
            }
            const rid = deepAccess(allBidsForThisBidid[seat], `ext.bidder.${bidderKey}.ruleId`, null);
            if (rid != null) {
              adserverTargeting[prefix + '_' + seat + '_rid'] = rid;
            }
            if (seat.match(/^ozappnexus/)) {
              adserverTargeting[prefix + '_' + seat + '_sid'] = String(allBidsForThisBidid[seat].cid);
            }
            labels = deepAccess(allBidsForThisBidid[seat], 'ext.prebid.labels', null);
            if (labels) {
              adserverTargeting[prefix + '_' + seat + '_labels'] = labels.join(',');
            }
          });
        } else {
          const perBidInfo = `${bidderKey}.enhancedAdserverTargeting is set to false. No per-bid keys will be sent to adserver.`;
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
        adserverTargeting[prefix + '_auc_id'] = String(aucId); // was request.bidderRequest.auctionId
        adserverTargeting[prefix + '_winner'] = String(winningSeat);
        adserverTargeting[prefix + '_bid'] = 'true';
        adserverTargeting[prefix + '_cache_id'] = deepAccess(thisBid, 'ext.prebid.targeting.hb_cache_id', 'no-id');
        adserverTargeting[prefix + '_uuid'] = deepAccess(thisBid, 'ext.prebid.targeting.hb_uuid', 'no-id');
        if (enhancedAdserverTargeting) {
          // 20250211 - labels returned (array)
          labels = deepAccess(winningBid, 'ext.prebid.labels', null);
          if (labels) {
            adserverTargeting[prefix + '_labels'] = labels.join(',');
          }
          adserverTargeting[prefix + '_imp_id'] = String(winningBid.impid);
          adserverTargeting[prefix + '_pb_v'] = OZONEVERSION;
          adserverTargeting[prefix + '_pb'] = winningBid.price;
          adserverTargeting[prefix + '_pb_r'] = getRoundedBid(winningBid.price, bidType);
          adserverTargeting[prefix + '_adId'] = String(winningBid.adId);
          adserverTargeting[prefix + '_size'] = `${winningBid.width}x${winningBid.height}`;
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
    // before returning - decide - was this a fledge-type auction?
    // ix type of implementation - this is more like what ozone want to do - don't modify the auctionConfigs
    // let fledgeAuctionConfigs = deepAccess(serverResponse, 'ext.protectedAudienceAuctionConfigs') || [];
    let fledgeAuctionConfigs = deepAccess(serverResponse, 'ext.igi') || []; // 20240606 standardising
    if (isArray(fledgeAuctionConfigs) && fledgeAuctionConfigs.length > 0) {
      // Validate and filter fledgeAuctionConfigs
      fledgeAuctionConfigs = fledgeAuctionConfigs.filter(cfg => {
        if (typeof cfg !== 'object' || cfg === null) {
          logWarn('Removing malformed fledge auction config:', cfg);
          return false;
        }
        return true;
      });
      ret = {
        bids: arrAllBids,
        fledgeAuctionConfigs,
      };
    }
    const endTime = new Date().getTime();
    logInfo(`interpretResponse going to return at time ${endTime} (took ${endTime - startTime}ms) Time from buildRequests Start -> interpretRequests End = ${endTime - this.propertyBag.buildRequestsStart}ms`);
    logInfo('will return: ', deepClone(ret)); // this is ok to log because the renderer has not been attached yet
    return ret;
  },
  setBidMediaTypeIfNotExist(thisBid, mediaType) {
    if (!thisBid.hasOwnProperty('mediaType')) {
      logInfo(`setting thisBid.mediaType = ${mediaType}`);
      thisBid.mediaType = mediaType;
    } else {
      logInfo(`found value for thisBid.mediaType: ${thisBid.mediaType}`);
    }
  },
  removeSingleBidderMultipleBids(seatbid) {
    var ret = [];
    for (let i = 0; i < seatbid.length; i++) {
      const sb = seatbid[i];
      var retSeatbid = {'seat': sb.seat, 'bid': []};
      var bidIds = [];
      for (let j = 0; j < sb.bid.length; j++) {
        var candidate = sb.bid[j];
        if (bidIds.includes(candidate.impid)) {
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
    const { gppString = '', applicableSections = [] } = gppConsent;
    if (optionsType.iframeEnabled) {
      const arrQueryString = [];
      if (config.getConfig('debug')) {
        arrQueryString.push('pbjs_debug=true');
      }
      arrQueryString.push('gdpr=' + (deepAccess(gdprConsent, 'gdprApplies', false) ? '1' : '0'));
      arrQueryString.push('gdpr_consent=' + deepAccess(gdprConsent, 'consentString', ''));
      arrQueryString.push('usp_consent=' + (usPrivacy || ''));
      // NOTE GPP support in CMPs is becoming available for testing
      arrQueryString.push('gpp=' + gppString);
      if (Array.isArray(applicableSections)) {
        arrQueryString.push(`gpp_sid=${applicableSections.join()}`);
      }
      for (const keyname in this.cookieSyncBag.userIdObject) {
        arrQueryString.push(keyname + '=' + this.cookieSyncBag.userIdObject[keyname]);
      }
      arrQueryString.push('publisherId=' + this.cookieSyncBag.publisherId);
      arrQueryString.push('siteId=' + this.cookieSyncBag.siteId);
      arrQueryString.push('cb=' + Date.now());
      arrQueryString.push('bidder=' + BIDDER_CODE);
      let strQueryString = arrQueryString.join('&');
      if (strQueryString.length > 0) {
        strQueryString = '?' + strQueryString;
      }
      logInfo('getUserSyncs going to return cookie sync url : ' + this.getCookieSyncUrl() + strQueryString);
      return [{ type: 'iframe', url: this.getCookieSyncUrl() + strQueryString }];
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
    const requestBid = this.getBidRequestForBidId(bidId, arrBids);
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
    // ALERT - you cannot set userIdAsEids on bidRequest!
    // Object.getOwnPropertyDescriptor(o, 'userIdAsEids') shows
    // {
    //     "enumerable": false,
    //     "configurable": true,
    //     "get": f,
    //     "set": undefined
    // }
    // this.debugBidRequest(bidRequest);
    //
    // Much simpler code than before, iterate over eids BUT note that eids have different keys
    // see the table on https://docs.prebid.org/dev-docs/modules/userId.html
    // logInfo('findAllUserIdsFromEids working with bidRequest', bidRequest);
    // this.debugBidRequest(bidRequest);

    const ret = {};
    // 20250819 change - venatus noticed problems when userIdAsEids was present but not an array. Prebid fixed this Aug 2025 but this was implemented here just in case an older version of pb core is being used.
    let userIdAsEids = bidRequest.userIdAsEids || [];

    // good solution but this is not testable!!
    // https://docs.prebid.org/dev-docs/publisher-api-reference/getUserIdsAsEids.html - this will return an array. Except it doesn't always.
    // if (typeof getGlobal().getUserIdsAsEids === 'function') {
    //   userIdAsEids = getGlobal().getUserIdsAsEids();
    //   logInfo('findAllUserIdsFromEids got userIdAsEids from global getUserIdsAsEids', userIdAsEids);
    // }

    // if (!Array.isArray(userIdAsEids)) {
    //   logInfo('findAllUserIdsFromEids setting userIdAsEids to an empty array');
    //   userIdAsEids = [];
    // }
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
    for (const obj of userIdAsEids) {
      ret[obj.source] = deepAccess(obj, 'uids.0.id');
    }
    this.tryGetPubCidFromOldLocation(ret, bidRequest); // legacy
    return ret;
  },
  debugBidRequest(o) {
    const hasOwn = Object.hasOwn(o, 'userIdAsEids');
    const inChain = 'userIdAsEids' in o;
    const ownDesc = Object.getOwnPropertyDescriptor(o, 'userIdAsEids');
    const proto = Object.getPrototypeOf(o);
    const protoDesc = proto && Object.getOwnPropertyDescriptor(proto, 'userIdAsEids');
    const hasToJSON = typeof o?.toJSON === 'function';
    logInfo({info: "***** DEBUG object *****",
      extensible: Object.isExtensible(o),
      hasOwn,
      inChain,
      ownDesc,      // if exists but enumerable:false, stringify will hide it
      protoDesc,    // if accessor with {get: f, set: undefined}, assignment won’t create an own prop
      hasToJSON,
      keys: Object.keys(o),
      reflectSetOk: Reflect.set(o, '___probe', 1, o),
      hasProbe: Object.hasOwn(o, '___probe')
    });
  },
  tryGetPubCidFromOldLocation(ret, bidRequest) {
    if (!ret.hasOwnProperty('pubcid')) {
      const pubcid = deepAccess(bidRequest, 'crumbs.pubcid');
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
    const arr = this.getGetParametersAsObject();
    if (arr.hasOwnProperty(KEY_PREFIX + 'storedrequest')) {
      if (this.isValidPlacementId(arr[KEY_PREFIX + 'storedrequest'])) {
        logInfo(`using GET ${KEY_PREFIX}storedrequest=` + arr[KEY_PREFIX + 'storedrequest'] + ' to replace placementId');
        return arr[KEY_PREFIX + 'storedrequest'];
      } else {
        logError(`GET ${KEY_PREFIX}storedrequest FAILED VALIDATION - will not use it`);
      }
    }
    return null;
  },
  getGetParametersAsObject() {
    const parsed = parseUrl(getRefererInfo().location);
    logInfo('getGetParametersAsObject found:', parsed.search);
    return parsed.search;
  },
  /**
   * Do we have to block this request? Could be due to config values (no longer checking gdpr)
   * @returns {boolean|*[]} true = block the request, else false
   */
  blockTheRequest() {
    // if there is an ozone.oz_request = false then quit now.
    const ozRequest = config.getConfig('ozone.oz_request');
    if (ozRequest === false) {
      logWarn('Will not allow the auction : oz_request is set to false');
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
      const allowable = '0123456789abcdefghijklmnopqrstuvwxyz';
      for (let i = 20; i > 0; i--) {
        randPart += allowable[Math.floor(Math.random() * 36)];
      }
      this.propertyBag.pageId = new Date().getTime() + '_' + randPart;
    }
    // NOTE this would allow us to access the pv value outside of prebid after the auction request.
    // let storage = getStorageManager(this.gvlid, 'ozone');
    // if (storage.localStorageIsEnabled()) {
    //   storage.setDataInLocalStorage('ozone_pv', this.propertyBag.pageId);
    // }
    return this.propertyBag.pageId;
  },
  /**
   *
   * look in ONE object to get video config (we need to call this multiple times, so child settings override parent)
   * @param videoConfig
   * @param childConfig
   * @returns {*}
   * @private
   */
  unpackVideoConfigIntoIABformat(videoConfig, childConfig) {
    let ret = {'ext': {}};
    ret = this._unpackVideoConfigIntoIABformat(ret, videoConfig);
    ret = this._unpackVideoConfigIntoIABformat(ret, childConfig);
    return ret;
  },
  _unpackVideoConfigIntoIABformat(ret, objConfig) {
    // @todo 20250310 i propose to remove placement - all it does is causes no outstream bids to be returned. Everyone should be using plcmt
    const arrVideoKeysAllowed = ['mimes', 'minduration', 'maxduration', 'protocols', 'w', 'h', 'startdelay', 'placement', 'plcmt', 'linearity', 'skip', 'skipmin', 'skipafter', 'sequence', 'battr', 'maxextended', 'minbitrate', 'maxbitrate', 'boxingallowed', 'playbackmethod', 'playbackend', 'delivery', 'pos', 'companionad', 'api', 'companiontype'];
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
    const apply = (cfg, addIfMissing) => {
      if (!cfg) return;
      const placement = this.getVideoPlacementValue(deepAccess(cfg, 'context'));
      if (placement) {
        objRet.placement = placement;
      }
      const skippable = deepAccess(cfg, 'skippable', null);
      if (skippable == null) {
        if (addIfMissing && !objRet.hasOwnProperty('skip')) {
          objRet.skip = 0;
        }
      } else {
        objRet.skip = skippable ? 1 : 0;
      }
    };
    apply(videoConfig, false);
    apply(childConfig, true);
    return objRet;
  },
  // NOTE we can't stringify bid object in prebid7 because of circular refs!
  getLoggableBidObject(bid) {
    const logObj = {
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
    const sb = seatbid[i];
    for (let j = 0; j < sb.bid.length; j++) {
      // modify the bidId per-bid, so each bid has a unique adId within this response, and dfp can select one.
      // 2020-06 we now need a second level of ID because there might be multiple identical impid's within a seatbid!
      sb.bid[j]['adId'] = `${sb.bid[j]['impid']}-${i}-${KEY_PREFIX}-${j}`;
    }
  }
  return seatbid;
}
export function defaultSize(thebidObj) {
  if (!thebidObj) {
    logInfo('defaultSize received empty bid obj! going to return fixed default size');
    return {
      'defaultHeight': 250,
      'defaultWidth': 300
    };
  }
  const sizes = thebidObj.sizes || [];
  const first = Array.isArray(sizes[0]) ? sizes[0] : sizes;
  return {
    defaultWidth: first[0],
    defaultHeight: first[1]
  };
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
    const theseBids = serverResponseSeatBid[j].bid;
    const thisSeat = serverResponseSeatBid[j].seat;
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
 * @param serverResponseSeatBid Array = the full seatbid array
 * @param defaultWidth int
 * @param defaultHeight int
 * @returns Object = {ozone|320x600:{obj}, ozone|320x250:{obj}, appnexus|300x250:{obj}, ... }
 */
export function ozoneGetAllBidsForBidId(matchBidId, serverResponseSeatBid, defaultWidth, defaultHeight) {
  const objBids = {};
  for (let j = 0; j < serverResponseSeatBid.length; j++) {
    const theseBids = serverResponseSeatBid[j].bid;
    const thisSeat = serverResponseSeatBid[j].seat;
    for (let k = 0; k < theseBids.length; k++) {
      if (theseBids[k].impid === matchBidId) {
        if (objBids.hasOwnProperty(thisSeat)) { // > 1 bid for an adunit from a bidder - only use the one with the highest bid
          if (objBids[thisSeat]['price'] < theseBids[k].price) {
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
export function getRoundedBid(price, mediaType) {
  const mediaTypeGranularity = config.getConfig(`mediaTypePriceGranularity.${mediaType}`);
  let key = 'auto';
  let buckets = config.getConfig('customPriceBucket');
  if (typeof mediaTypeGranularity === 'string') {
    key = mediaTypeGranularity;
  } else if (typeof mediaTypeGranularity === 'object') {
    key = 'custom';
    buckets = mediaTypeGranularity;
  } else {
    const strBuckets = config.getConfig('priceGranularity');
    if (typeof strBuckets === 'string') {
      key = strBuckets;
    }
    if (strBuckets === 'custom') {
      key = 'custom';
    }
  }
  const mapping = {medium: 'med', custom: 'custom', high: 'high', low: 'low', dense: 'dense'};
  const priceStrings = getPriceBucketString(price, buckets, config.getConfig('currency.granularityMultiplier'));
  logInfo('getRoundedBid price:', price, 'mediaType:', mediaType, 'bucketKey:', key);
  return priceStrings[mapping[key] || 'auto'];
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
let rendererInstance;
function newRenderer(adUnitCode, rendererOptions = {}) {
  if (!rendererInstance) {
    rendererInstance = Renderer.install({
      url: spec.getRendererUrl(),
      config: rendererOptions,
      loaded: false,
      adUnitCode
    });
    try {
      rendererInstance.setRender(outstreamRender);
    } catch (err) {
      logError('Prebid Error calling renderer.setRender', rendererInstance, err);
    }
    logInfo('created renderer object');
  }
  return rendererInstance;
}
// NOTE from prebid 7, we can no longer log JSON.parse(JSON.stringify(bid)) - this causes a circular reference
function outstreamRender(bid) {
  logInfo('outstreamRender got', deepClone(bid));
  bid.renderer.push(() => {
    logInfo('outstreamRender: Going to execute window.ozoneVideo.outstreamRender');
    window.ozoneVideo.outstreamRender(bid);
  });
}
registerBidder(spec);
logInfo(`*BidAdapter ${OZONEVERSION} was loaded`);
