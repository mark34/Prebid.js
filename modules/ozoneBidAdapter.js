import * as utils from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, NATIVE, VIDEO } from '../src/mediaTypes.js';
import {config} from '../src/config.js';
import {getPriceBucketString} from '../src/cpmBucketManager.js';
import { Renderer } from '../src/Renderer.js';
import {loadExternalScript} from '../src/adloader.js';

/*
GET parameters:
'oz_lotameid', 'oz_lotamepid', 'oz_lotametpid' (all 3 must be present if you want to use this override)
pbjs_debug=true
 */
const BIDDER_CODE = 'ozone';
const ALLOWED_LOTAME_PARAMS = ['oz_lotameid', 'oz_lotamepid', 'oz_lotametpid'];
const OPENRTB_COMPLIANT = true; // 2020-05-28 video change - send non rtb params to ext

// testing fake endpoint for cookie sync new code with postMessage
// const OZONECOOKIESYNC = 'http://local.bussongs.com/prebid-cookie-sync-development.html';
// const OZONECOOKIESYNC = 'https://betalyst.local/prebid-cookie-sync-development.html';

// *** DEV-ozpr
// const OZONEURI = 'https://test.ozpr.net/openrtb2/auction';
// const OZONECOOKIESYNC = 'https://test.ozpr.net/static/load-cookie.html';
// const OZONE_RENDERER_URL = 'http://silvermine.io/ozone/publishers/telegraph/ozone_files/ozone-renderer-jw-unruly.js';
// const OZONE_RENDERER_URL = 'https://www.betalyst.com/test/ozone-renderer-handle-refresh.js'; // video testing

// *** DEV-afsheen
// const OZONEURI = 'http://afsheen-dev.the-ozone-project.com/openrtb2/auction';
// const OZONECOOKIESYNC = 'http://afsheen-dev.the-ozone-project.com/static/load-cookie.html';
// const OZONE_RENDERER_URL = 'http://silvermine.io/ozone/publishers/telegraph/ozone_files/ozone-renderer-jw-unruly.js';

// *** PROD ***
const OZONEURI = 'https://elb.the-ozone-project.com/openrtb2/auction';
const OZONECOOKIESYNC = 'https://elb.the-ozone-project.com/static/load-cookie.html';
// const OZONE_RENDERER_URL = 'https://www.betalyst.com/test/ozone-renderer-handle-refresh-via-gpt.js'; // video testing
// const OZONE_RENDERER_URL = 'https://www.betalyst.com/test/ozone-renderer-handle-refresh-guardian20200602-with-gpt.js';
// const OZONE_RENDERER_URL = 'https://prebid.the-ozone-project.com/ozone-renderer.js';
// const OZONE_RENDERER_URL = 'http://localhost:9888/ozone-renderer-handle-refresh-via-gpt.js'; // video testing local
// const OZONE_RENDERER_URL = 'http://localhost:9888/ozone-renderer-handle-refresh-guardian20200602-with-gpt.js'; // video testing local for guardian
// const OZONE_RENDERER_URL = 'http://localhost:9888/ozone-renderer-switch.js'; // video testing local

// 20200605 - test js renderer
const OZONE_RENDERER_URL = 'https://www.ardm.io/ozone/2.2.0/testpages/test/ozone-renderer.js';
const OZONEVERSION = '2.4.0-timing-fix';
export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [VIDEO, BANNER],
  cookieSyncBag: {'publisherId': null, 'siteId': null, 'userIdObject': {}}, // variables we want to make available to cookie sync
  propertyBag: {'lotameWasOverridden': 0, 'pageId': null}, /* allow us to store vars in instance scope - needs to be an object to be mutable */

  /**
   * Basic check to see whether required parameters are in the request.
   * @param bid
   * @returns {boolean}
   */
  isBidRequestValid(bid) {
    utils.logInfo('OZONE: isBidRequestValid : ', config.getConfig(), bid);
    let adUnitCode = bid.adUnitCode; // adunit[n].code

    if (!(bid.params.hasOwnProperty('placementId'))) {
      utils.logError('OZONE: OZONE BID ADAPTER VALIDATION FAILED : missing placementId : siteId, placementId and publisherId are REQUIRED', adUnitCode);
      return false;
    }
    if (!this.isValidPlacementId(bid.params.placementId)) {
      utils.logError('OZONE: OZONE BID ADAPTER VALIDATION FAILED : placementId must be exactly 10 numeric characters', adUnitCode);
      return false;
    }
    if (!(bid.params.hasOwnProperty('publisherId'))) {
      utils.logError('OZONE: OZONE BID ADAPTER VALIDATION FAILED : missing publisherId : siteId, placementId and publisherId are REQUIRED', adUnitCode);
      return false;
    }
    if (!(bid.params.publisherId).toString().match(/^[a-zA-Z0-9\-]{12}$/)) {
      utils.logError('OZONE: OZONE BID ADAPTER VALIDATION FAILED : publisherId must be exactly 12 alphanumieric characters including hyphens', adUnitCode);
      return false;
    }
    if (!(bid.params.hasOwnProperty('siteId'))) {
      utils.logError('OZONE: OZONE BID ADAPTER VALIDATION FAILED : missing siteId : siteId, placementId and publisherId are REQUIRED', adUnitCode);
      return false;
    }
    if (!(bid.params.siteId).toString().match(/^[0-9]{10}$/)) {
      utils.logError('OZONE: OZONE BID ADAPTER VALIDATION FAILED : siteId must be exactly 10 numeric characters', adUnitCode);
      return false;
    }
    if (bid.params.hasOwnProperty('customParams')) {
      utils.logError('OZONE: OZONE BID ADAPTER VALIDATION FAILED : customParams should be renamed to customData', adUnitCode);
      return false;
    }
    if (bid.params.hasOwnProperty('customData')) {
      if (!Array.isArray(bid.params.customData)) {
        utils.logError('OZONE: OZONE BID ADAPTER VALIDATION FAILED : customData is not an Array', adUnitCode);
        return false;
      }
      if (bid.params.customData.length < 1) {
        utils.logError('OZONE: OZONE BID ADAPTER VALIDATION FAILED : customData is an array but does not contain any elements', adUnitCode);
        return false;
      }
      if (!(bid.params.customData[0]).hasOwnProperty('targeting')) {
        utils.logError('OZONE: OZONE BID ADAPTER VALIDATION FAILED : customData[0] does not contain "targeting"', adUnitCode);
        return false;
      }
      if (typeof bid.params.customData[0]['targeting'] != 'object') {
        utils.logError('OZONE: OZONE BID ADAPTER VALIDATION FAILED : customData[0] targeting is not an object', adUnitCode);
        return false;
      }
    }
    if (bid.params.hasOwnProperty('lotameData')) {
      if (typeof bid.params.lotameData !== 'object') {
        utils.logError('OZONE: OZONE BID ADAPTER VALIDATION FAILED : lotameData is not an object', adUnitCode);
        return false;
      }
    }
    if (bid.hasOwnProperty('mediaTypes') && bid.mediaTypes.hasOwnProperty(VIDEO)) {
      if (!bid.mediaTypes[VIDEO].hasOwnProperty('context')) {
        utils.logError('OZONE: No video context key/value in bid. Rejecting bid: ', bid);
        return false;
      }
      if (bid.mediaTypes[VIDEO].context === 'instream') {
        utils.logWarn('OZONE: video.context instream is not supported. Only outstream video is supported. Video will not be used for Bid: ', bid);
      } else if (bid.mediaTypes.video.context !== 'outstream') {
        utils.logError('OZONE: video.context is invalid. Only outstream video is supported. Rejecting bid: ', bid);
        return false;
      }
    }
    // guard against hacks in GET parameters that we might allow
    const arrLotameOverride = this.getLotameOverrideParams();
    // lotame override, test params. All 3 must be present, or none.
    let lotameKeys = Object.keys(arrLotameOverride);
    if (lotameKeys.length === ALLOWED_LOTAME_PARAMS.length) {
      utils.logInfo('OZONE: VALIDATION : arrLotameOverride', arrLotameOverride);
      for (let i in lotameKeys) {
        if (!arrLotameOverride[ALLOWED_LOTAME_PARAMS[i]].toString().match(/^[0-9a-zA-Z]+$/)) {
          utils.logError('OZONE: Only letters & numbers allowed in lotame override: ' + i.toString() + ': ' + arrLotameOverride[ALLOWED_LOTAME_PARAMS[i]].toString() + '. Rejecting bid: ', bid);
          return false;
        }
      }
    } else if (lotameKeys.length > 0) {
      utils.logInfo('OZONE: VALIDATION : arrLotameOverride', arrLotameOverride);
      utils.logError('OZONE: lotame override params are incomplete. You must set all ' + ALLOWED_LOTAME_PARAMS.length + ': ' + JSON.stringify(ALLOWED_LOTAME_PARAMS) + ', . Rejecting bid: ', bid);
      return false;
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
    utils.logInfo('OZONE: ozone v' + OZONEVERSION + ' validBidRequests', validBidRequests, 'bidderRequest', bidderRequest);
    // First check - is there any config to block this request?
    if (this.blockTheRequest(bidderRequest)) {
      return [];
    }
    let htmlParams = {'publisherId': '', 'siteId': ''};
    if (validBidRequests.length > 0) {
      this.cookieSyncBag.userIdObject = Object.assign(this.cookieSyncBag.userIdObject, this.findAllUserIds(validBidRequests[0]));
      this.cookieSyncBag.siteId = utils.deepAccess(validBidRequests[0], 'params.siteId');
      this.cookieSyncBag.publisherId = utils.deepAccess(validBidRequests[0], 'params.publisherId');
      htmlParams = validBidRequests[0].params;
    }
    utils.logInfo('OZONE: cookie sync bag', this.cookieSyncBag);
    let singleRequest = config.getConfig('ozone.singleRequest');
    singleRequest = singleRequest !== false; // undefined & true will be true
    utils.logInfo('OZONE: config ozone.singleRequest : ', singleRequest);
    let ozoneRequest = {}; // we only want to set specific properties on this, not validBidRequests[0].params
    delete ozoneRequest.test; // don't allow test to be set in the config - ONLY use $_GET['pbjs_debug']

    if (bidderRequest && bidderRequest.gdprConsent) {
      utils.logInfo('OZONE: ADDING GDPR info');
      // setting default values in case there is no additional information, like for the Mirror
      ozoneRequest.regs = {ext: {gdpr: bidderRequest.gdprConsent.gdprApplies ? 1 : 0}};
      if (ozoneRequest.regs.ext.gdpr) {
        ozoneRequest.user = ozoneRequest.user || {};
        ozoneRequest.user.ext = {'consent': bidderRequest.gdprConsent.consentString};
      } else {
        utils.logInfo('OZONE: **** Failed to find required info for GDPR for request object, even though bidderRequest.gdprConsent is TRUE ****');
      }
    } else {
      utils.logInfo('OZONE: WILL NOT ADD GDPR info; no bidderRequest.gdprConsent object was present.');
    }
    const getParams = this.getGetParametersAsObject();
    const ozTestMode = getParams.hasOwnProperty('oztestmode') ? getParams.oztestmode : null; // this can be any string, it's used for testing ads
    ozoneRequest.device = {'w': window.innerWidth, 'h': window.innerHeight};
    let placementIdOverrideFromGetParam = this.getPlacementIdOverrideFromGetParam(); // null or string
    let lotameDataSingle = {}; // we will capture lotame data once & send it to the server as ext.ozone.lotameData
    // build the array of params to attach to `imp`
    let tosendtags = validBidRequests.map(ozoneBidRequest => {
      var obj = {};
      let placementId = placementIdOverrideFromGetParam || this.getPlacementId(ozoneBidRequest); // prefer to use a valid override param, else the bidRequest placement Id
      obj.id = ozoneBidRequest.bidId; // this causes an error if we change it to something else, even if you update the bidRequest object: "WARNING: Bidder ozone made bid for unknown request ID: mb7953.859498327448. Ignoring."
      obj.tagid = placementId;
      obj.secure = window.location.protocol === 'https:' ? 1 : 0;
      // is there a banner (or nothing declared, so banner is the default)?
      let arrBannerSizes = [];
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
        if (ozoneBidRequest.mediaTypes.hasOwnProperty(VIDEO) && ozoneBidRequest.mediaTypes[VIDEO].context === 'outstream') {
          if (!this.isOpenRtbCompliantMode()) {
            // old code :
            obj.video = ozoneBidRequest.mediaTypes[VIDEO];
            utils.logInfo('OZONE: ** NOT openrtb 2.5 compliant video **');
          } else {
            utils.logInfo('OZONE: in openrtb 2.5 compliant video mode');
            // new code:
            // examine all the video attributes in the config, and either put them into obj.video if allowed by IAB2.5 or else in to obj.video.ext
            if (typeof ozoneBidRequest.mediaTypes[VIDEO] == 'object') {
              let childConfig = utils.deepAccess(ozoneBidRequest, 'params.video');
              obj.video = this.unpackVideoConfigIntoIABformat(ozoneBidRequest.mediaTypes[VIDEO], childConfig);
              obj.video = this.addVideoDefaults(obj.video, ozoneBidRequest.mediaTypes[VIDEO], childConfig);
            }
          }
          utils.logInfo('OZONE: Video renderer URL = ' + OZONE_RENDERER_URL);
          // we need to duplicate some of the video values
          let wh = getWidthAndHeightFromVideoObject(obj.video);
          utils.logInfo('OZONE: setting video object from the mediaTypes.video element: ' + obj.id + ':', obj.video, 'wh=', wh);
          if (wh && typeof wh === 'object') {
            obj.video.w = wh['w'];
            obj.video.h = wh['h'];
            if (playerSizeIsNestedArray(obj.video)) { // this should never happen; it was in the original spec for this change though.
              utils.logInfo('OZONE: setting obj.video.format to be an array of objects');
              if (this.isOpenRtbCompliantMode()) {
                obj.video.ext.format = [wh];
              } else {
                obj.video.format = [wh];
              }
            } else {
              utils.logInfo('OZONE: setting obj.video.format to be an object');
              if (this.isOpenRtbCompliantMode()) {
                obj.video.ext.format = wh;
              } else {
                obj.video.format = wh;
              }
            }
          } else {
            utils.logWarn('OZONE: cannot set w, h & format values for video; the config is not right');
          }
        }
        // Native integration is not complete yet
        if (ozoneBidRequest.mediaTypes.hasOwnProperty(NATIVE)) {
          obj.native = ozoneBidRequest.mediaTypes[NATIVE];
          utils.logInfo('OZONE: setting native object from the mediaTypes.native element: ' + obj.id + ':', obj.native);
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
      // build the imp['ext'] object
      obj.ext = {'prebid': {'storedrequest': {'id': placementId}}, 'ozone': {}};
      obj.ext.ozone.adUnitCode = ozoneBidRequest.adUnitCode; // eg. 'mpu'
      obj.ext.ozone.transactionId = ozoneBidRequest.transactionId; // this is the transactionId PER adUnit, common across bidders for this unit
      if (ozoneBidRequest.params.hasOwnProperty('customData')) {
        obj.ext.ozone.customData = ozoneBidRequest.params.customData;
      }
      utils.logInfo('OZONE: obj.ext.ozone is ', obj.ext.ozone);
      if (ozTestMode != null) {
        utils.logInfo('OZONE: setting ozTestMode to ', ozTestMode);
        if (obj.ext.ozone.hasOwnProperty('customData')) {
          for (let i = 0; i < obj.ext.ozone.customData.length; i++) {
            obj.ext.ozone.customData[i]['targeting']['oztestmode'] = ozTestMode;
          }
        } else {
          obj.ext.ozone.customData = [{'settings': {}, 'targeting': {'oztestmode': ozTestMode}}];
        }
      } else {
        utils.logInfo('OZONE: no ozTestMode ');
      }
      // now deal with lotame, including the optional override parameters
      if (Object.keys(lotameDataSingle).length === 0) { // we've not yet found lotameData, see if we can get it from this bid request object
        lotameDataSingle = this.tryGetLotameData(ozoneBidRequest);
      }
      // otherwise don't set obj.ext.ozone.lotameData
      return obj;
    });

    // in v 2.0.0 we moved these outside of the individual ad slots
    let extObj = {'ozone': {'oz_pb_v': OZONEVERSION, 'oz_rw': placementIdOverrideFromGetParam ? 1 : 0, 'oz_lot_rw': this.propertyBag.lotameWasOverridden}};
    if (validBidRequests.length > 0) {
      let userIds = this.findAllUserIds(validBidRequests[0]);
      if (userIds.hasOwnProperty('pubcid')) {
        extObj.ozone.pubcid = userIds.pubcid;
      }
    }
    extObj.ozone.pv = this.getPageId(); // attach the page ID that will be common to all auciton calls for this page if refresh() is called
    extObj.ozone.lotameData = lotameDataSingle; // 2.4.0 moved lotameData out of bid objects into the single ext.ozone area to remove duplication
    let ozOmpFloorDollars = config.getConfig('ozone.oz_omp_floor'); // valid only if a dollar value (typeof == 'number')
    utils.logInfo('OZONE: oz_omp_floor dollar value = ', ozOmpFloorDollars);
    if (typeof ozOmpFloorDollars === 'number') {
      extObj.ozone.oz_omp_floor = ozOmpFloorDollars;
    } else if (typeof ozOmpFloorDollars !== 'undefined') {
      utils.logError('OZONE: oz_omp_floor is invalid - IF SET then this must be a number, representing dollar value eg. oz_omp_floor: 1.55. You have it set as a ' + (typeof ozOmpFloorDollars));
    }
    let ozWhitelistAdserverKeys = config.getConfig('ozone.oz_whitelist_adserver_keys');
    let useOzWhitelistAdserverKeys = utils.isArray(ozWhitelistAdserverKeys) && ozWhitelistAdserverKeys.length > 0;
    extObj.ozone.oz_kvp_rw = useOzWhitelistAdserverKeys ? 1 : 0;

    var userExtEids = this.generateEids(validBidRequests); // generate the UserIDs in the correct format for UserId module

    ozoneRequest.site = {
      'publisher': {'id': htmlParams.publisherId},
      'page': document.location.href,
      'id': htmlParams.siteId
    };
    ozoneRequest.test = (getParams.hasOwnProperty('pbjs_debug') && getParams['pbjs_debug'] == 'true') ? 1 : 0;

    // this is for 2.2.1
    // coppa compliance
    if (config.getConfig('coppa') === true) {
      utils.deepSetValue(ozoneRequest, 'regs.coppa', 1);
    }

    // return the single request object OR the array:
    if (singleRequest) {
      utils.logInfo('OZONE: buildRequests starting to generate response for a single request');
      ozoneRequest.id = bidderRequest.auctionId; // Unique ID of the bid request, provided by the exchange.
      ozoneRequest.auctionId = bidderRequest.auctionId; // not sure if this should be here?
      ozoneRequest.imp = tosendtags;
      ozoneRequest.ext = extObj;
      ozoneRequest.source = {'tid': bidderRequest.auctionId}; // RTB 2.5 : tid is Transaction ID that must be common across all participants in this bid request (e.g., potentially multiple exchanges).
      utils.deepSetValue(ozoneRequest, 'user.ext.eids', userExtEids);
      var ret = {
        method: 'POST',
        url: OZONEURI,
        data: JSON.stringify(ozoneRequest),
        bidderRequest: bidderRequest
      };
      utils.logInfo('OZONE: buildRequests ozoneRequest for single = ', ozoneRequest);
      utils.logInfo('OZONE: buildRequests going to return for single: ', ret);
      return ret;
    }
    // not single request - pull apart the tosendtags array & return an array of objects each containing one element in the imp array.
    let arrRet = tosendtags.map(imp => {
      utils.logInfo('OZONE: buildRequests starting to generate non-single response, working on imp : ', imp);
      let ozoneRequestSingle = Object.assign({}, ozoneRequest);
      imp.ext.ozone.pageAuctionId = bidderRequest['auctionId']; // make a note in the ext object of what the original auctionId was, in the bidderRequest object
      ozoneRequestSingle.id = imp.ext.ozone.transactionId; // Unique ID of the bid request, provided by the exchange.
      ozoneRequestSingle.auctionId = imp.ext.ozone.transactionId; // not sure if this should be here?
      ozoneRequestSingle.imp = [imp];
      ozoneRequestSingle.ext = extObj;
      ozoneRequestSingle.source = {'tid': imp.ext.ozone.transactionId};
      utils.deepSetValue(ozoneRequestSingle, 'user.ext.eids', userExtEids);
      utils.logInfo('OZONE: buildRequests ozoneRequestSingle (for non-single) = ', ozoneRequestSingle);
      return {
        method: 'POST',
        url: OZONEURI,
        data: JSON.stringify(ozoneRequestSingle),
        bidderRequest: bidderRequest
      };
    });
    utils.logInfo('OZONE: buildRequests going to return for non-single: ', arrRet);
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
    utils.logInfo('OZONE: interpretResponse: serverResponse, request', serverResponse, request);
    serverResponse = serverResponse.body || {};
    // note that serverResponse.id value is the auction_id we might want to use for reporting reasons.
    if (!serverResponse.hasOwnProperty('seatbid')) {
      return [];
    }
    if (typeof serverResponse.seatbid !== 'object') {
      return [];
    }
    let arrAllBids = [];
    let enhancedAdserverTargeting = config.getConfig('ozone.enhancedAdserverTargeting');
    utils.logInfo('OZONE: enhancedAdserverTargeting', enhancedAdserverTargeting);
    if (typeof enhancedAdserverTargeting == 'undefined') {
      enhancedAdserverTargeting = true;
    }
    utils.logInfo('OZONE: enhancedAdserverTargeting', enhancedAdserverTargeting);
    serverResponse.seatbid = injectAdIdsIntoAllBidResponses(serverResponse.seatbid); // we now make sure that each bid in the bidresponse has a unique (within page) adId attribute.
    let ozOmpFloorDollars = config.getConfig('ozone.oz_omp_floor'); // valid only if a dollar value (typeof == 'number')
    let addOzOmpFloorDollars = typeof ozOmpFloorDollars === 'number';
    let ozWhitelistAdserverKeys = config.getConfig('ozone.oz_whitelist_adserver_keys');
    let useOzWhitelistAdserverKeys = utils.isArray(ozWhitelistAdserverKeys) && ozWhitelistAdserverKeys.length > 0;

    for (let i = 0; i < serverResponse.seatbid.length; i++) {
      let sb = serverResponse.seatbid[i];
      for (let j = 0; j < sb.bid.length; j++) {
        let thisRequestBid = this.getBidRequestForBidId(sb.bid[j].impid, request.bidderRequest.bids);
        utils.logInfo('OZONE Going to set default w h for seatbid/bidRequest', sb.bid[j], thisRequestBid);
        const {defaultWidth, defaultHeight} = defaultSize(thisRequestBid);
        let thisBid = ozoneAddStandardProperties(sb.bid[j], defaultWidth, defaultHeight);
        let videoContext = null;
        let isVideo = false;
        let bidType = utils.deepAccess(thisBid, 'ext.prebid.type');
        utils.logInfo('OZONE: this bid type is : ', bidType);
        if (bidType === VIDEO) {
          utils.logInfo('OZONE: going to attach a renderer to:', j);
          let renderConf = createObjectForInternalVideoRender(thisBid, thisRequestBid);
          utils.logInfo('OZONE: going to try to load renderer independently');
          loadExternalScript(renderConf.url, 'outstream', renderConf.callback);
          thisBid.renderer = Renderer.install(renderConf); // note - we are no longer relying on the callback to set the render method on the renderer.
          thisBid.renderer.setRender(outstreamRender); // set immediately & let the render function decide whether to wait.
          // fix for refreshed video bids
          if (window.hasOwnProperty('ozoneVideo') && window.ozoneVideo.hasOwnProperty('outstreamRender')) {
            thisBid.renderer.setRender(outstreamRender);
          }
          // check whether this was instream or outstream (currently it will ONLY be outstream but this will probably change)
          videoContext = this.getVideoContextForBidId(thisBid.bidId, request.bidderRequest.bids); // should be instream or outstream (or null if error)
          isVideo = true;
        } else {
          utils.logInfo('OZONE: bid is not a video, will not attach a renderer: ', j);
        }
        let ozoneInternalKey = thisBid.bidId;
        let adserverTargeting = {};
        if (enhancedAdserverTargeting) {
          let allBidsForThisBidid = ozoneGetAllBidsForBidId(ozoneInternalKey, serverResponse.seatbid);
          // add all the winning & non-winning bids for this bidId:
          utils.logInfo('OZONE: Going to iterate allBidsForThisBidId', allBidsForThisBidid);
          Object.keys(allBidsForThisBidid).forEach(function (bidderName, index, ar2) {
            adserverTargeting['oz_' + bidderName] = bidderName;
            adserverTargeting['oz_' + bidderName + '_pb'] = String(allBidsForThisBidid[bidderName].price);
            adserverTargeting['oz_' + bidderName + '_crid'] = String(allBidsForThisBidid[bidderName].crid);
            adserverTargeting['oz_' + bidderName + '_adv'] = String(allBidsForThisBidid[bidderName].adomain);
            adserverTargeting['oz_' + bidderName + '_imp_id'] = String(allBidsForThisBidid[bidderName].impid);
            adserverTargeting['oz_' + bidderName + '_adId'] = String(allBidsForThisBidid[bidderName].adId);
            adserverTargeting['oz_' + bidderName + '_pb_r'] = getRoundedBid(allBidsForThisBidid[bidderName].price, allBidsForThisBidid[bidderName].ext.prebid.type);
            if (allBidsForThisBidid[bidderName].hasOwnProperty('dealid')) {
              adserverTargeting['oz_' + bidderName + '_dealid'] = String(allBidsForThisBidid[bidderName].dealid);
            }
            if (addOzOmpFloorDollars) {
              adserverTargeting['oz_' + bidderName + '_omp'] = allBidsForThisBidid[bidderName].price >= ozOmpFloorDollars ? '1' : '0';
            }
            if (isVideo) {
              adserverTargeting['oz_' + bidderName + '_vid'] = videoContext; // outstream [or instream (future)]
            }
            let flr = utils.deepAccess(allBidsForThisBidid[bidderName], 'ext.bidder.ozone.floor');
            if (flr) {
              adserverTargeting['oz_' + bidderName + '_flr'] = flr ? 1 : 0;
            }
            let rid = utils.deepAccess(allBidsForThisBidid[bidderName], 'ext.bidder.ozone.ruleId');
            if (rid) {
              adserverTargeting['oz_' + bidderName + '_rid'] = rid;
            }
            if (bidderName == 'ozappnexus') {
              adserverTargeting['oz_' + bidderName + '_sid'] = String(allBidsForThisBidid[bidderName].cid);
            }
          });
        } else {
          if (useOzWhitelistAdserverKeys) {
            utils.logWarn('OZONE: You have set a whitelist of adserver keys but this will be ignored because ozone.enhancedAdserverTargeting is set to false. No per-bid keys will be sent to adserver.');
          } else {
            utils.logInfo('OZONE: ozone.enhancedAdserverTargeting is set to false, so no per-bid keys will be sent to adserver.');
          }
        }
        // also add in the winning bid, to be sent to dfp
        let {seat: winningSeat, bid: winningBid} = ozoneGetWinnerForRequestBid(ozoneInternalKey, serverResponse.seatbid);
        adserverTargeting['oz_auc_id'] = String(request.bidderRequest.auctionId);
        adserverTargeting['oz_winner'] = String(winningSeat);
        adserverTargeting['oz_response_id'] = String(serverResponse.id);
        if (enhancedAdserverTargeting) {
          adserverTargeting['oz_winner_auc_id'] = String(winningBid.id);
          adserverTargeting['oz_winner_imp_id'] = String(winningBid.impid);
          adserverTargeting['oz_pb_v'] = OZONEVERSION;
        }
        if (useOzWhitelistAdserverKeys) { // delete any un-whitelisted keys
          utils.logInfo('OZONE: Going to filter out adserver targeting keys not in the whitelist: ', ozWhitelistAdserverKeys);
          Object.keys(adserverTargeting).forEach(function(key) { if (ozWhitelistAdserverKeys.indexOf(key) === -1) { delete adserverTargeting[key]; } });
        }
        thisBid.adserverTargeting = adserverTargeting;
        arrAllBids.push(thisBid);
      }
    }
    utils.logInfo('OZONE: interpretResponse going to return', arrAllBids);
    return arrAllBids;
  },
  // see http://prebid.org/dev-docs/bidder-adaptor.html#registering-user-syncs
  getUserSyncs(optionsType, serverResponse, gdprConsent) {
    utils.logInfo('OZONE: getUserSyncs optionsType, serverResponse, gdprConsent, cookieSyncBag', optionsType, serverResponse, gdprConsent, this.cookieSyncBag);
    if (!serverResponse || serverResponse.length === 0) {
      return [];
    }
    if (optionsType.iframeEnabled) {
      var arrQueryString = [];
      if (document.location.search.match(/pbjs_debug=true/)) {
        arrQueryString.push('pbjs_debug=true');
      }
      arrQueryString.push('gdpr=' + (utils.deepAccess(gdprConsent, 'gdprApplies', false) ? '1' : '0'));
      arrQueryString.push('gdpr_consent=' + utils.deepAccess(gdprConsent, 'consentString', ''));
      var objKeys = Object.getOwnPropertyNames(this.cookieSyncBag.userIdObject);
      for (let idx in objKeys) {
        let keyname = objKeys[idx];
        arrQueryString.push(keyname + '=' + this.cookieSyncBag.userIdObject[keyname]);
      }
      arrQueryString.push('publisherId=' + this.cookieSyncBag.publisherId);
      arrQueryString.push('siteId=' + this.cookieSyncBag.siteId);
      arrQueryString.push('cb=' + Date.now());

      var strQueryString = arrQueryString.join('&');
      if (strQueryString.length > 0) {
        strQueryString = '?' + strQueryString;
      }
      utils.logInfo('OZONE: getUserSyncs going to return cookie sync url : ' + OZONECOOKIESYNC + strQueryString);
      return [{
        type: 'iframe',
        url: OZONECOOKIESYNC + strQueryString
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
      return utils.deepAccess(requestBid, 'mediaTypes.video.context', 'unknown')
    }
    return null;
  },
  /**
   *  Look for pubcid & all the other IDs according to http://prebid.org/dev-docs/modules/userId.html
   *  @return map
   */
  findAllUserIds(bidRequest) {
    var ret = {};
    let searchKeysSingle = ['pubcid', 'tdid', 'id5id', 'parrableid', 'idl_env', 'digitrustid', 'criteortus'];
    utils.logInfo('OZONE: findAllUserIds iterating keys');
    utils.logInfo('OZONE: findAllUserIds bidRequest=', bidRequest);
    if (bidRequest.hasOwnProperty('userId')) {
      utils.logInfo('OZONE: findAllUserIds Looking inside userId element');
      for (let arrayId in searchKeysSingle) {
        let key = searchKeysSingle[arrayId];
        utils.logInfo('OZONE: findAllUserIds key=', key);
        if (bidRequest.userId.hasOwnProperty(key)) {
          utils.logInfo('OZONE: findAllUserIds found value : ', key);
          ret[key] = bidRequest.userId[key];
        }
      }
      var lipbid = utils.deepAccess(bidRequest.userId, 'lipb.lipbid');
      if (lipbid) {
        ret['lipb'] = {'lipbid': lipbid};
      }
    }
    if (!ret.hasOwnProperty('pubcid')) {
      var pubcid = utils.deepAccess(bidRequest, 'crumbs.pubcid');
      if (pubcid) {
        ret['pubcid'] = pubcid; // if built with old pubCommonId module
      }
    }
    utils.logInfo('OZONE: debug going to return: ', ret);
    return ret;
  },
  /**
   * get all the lotame override keys/values from the querystring.
   * @return object containing zero or more keys/values
   */
  getLotameOverrideParams() {
    const arrGet = this.getGetParametersAsObject();
    utils.logInfo('OZONE: getLotameOverrideParams - arrGet', arrGet);
    let arrRet = {};
    for (let i in ALLOWED_LOTAME_PARAMS) {
      if (arrGet.hasOwnProperty(ALLOWED_LOTAME_PARAMS[i])) {
        arrRet[ALLOWED_LOTAME_PARAMS[i]] = arrGet[ALLOWED_LOTAME_PARAMS[i]];
      }
    }
    return arrRet;
  },
  /**
   * Boolean function to check that this lotame data is valid (check Audience.id)
   */
  isLotameDataValid(lotameObj) {
    if (!lotameObj.hasOwnProperty('Profile')) return false;
    let prof = lotameObj.Profile;
    if (!prof.hasOwnProperty('tpid')) return false;
    if (!prof.hasOwnProperty('pid')) return false;
    let audiences = utils.deepAccess(prof, 'Audiences.Audience');
    if (typeof audiences != 'object') {
      return false;
    }
    for (var i = 0; i < audiences.length; i++) {
      let aud = audiences[i];
      if (!aud.hasOwnProperty('id')) {
        return false;
      }
    }
    return true; // All Audiences objects have an 'id' key
  },
  /**
   * Use the arrOverride keys/vals to update the arrExisting lotame object.
   * Ideally we will only be using the oz_lotameid value to update the audiences id, but in the event of bad/missing
   * pid & tpid we will also have to use substitute values for those too.
   *
   * @param objOverride object will contain all the ALLOWED_LOTAME_PARAMS parameters
   * @param lotameData object might be {} or contain the lotame data
   */
  makeLotameObjectFromOverride(objOverride, lotameData) {
    if ((lotameData.hasOwnProperty('Profile') && Object.keys(lotameData.Profile).length < 3) ||
      (!lotameData.hasOwnProperty('Profile'))) { // bad or empty lotame object (should contain pid, tpid & Audiences object) - build a total replacement
      utils.logInfo('OZONE: makeLotameObjectFromOverride', 'will return a full default lotame object');
      return {
        'Profile': {
          'tpid': objOverride['oz_lotametpid'],
          'pid': objOverride['oz_lotamepid'],
          'Audiences': {'Audience': [{'id': objOverride['oz_lotameid'], 'abbr': objOverride['oz_lotameid']}]}
        }
      };
    }
    if (utils.deepAccess(lotameData, 'Profile.Audiences.Audience')) {
      utils.logInfo('OZONE: makeLotameObjectFromOverride', 'will return the existing lotame object with updated Audience by oz_lotameid');
      lotameData.Profile.Audiences.Audience = [{'id': objOverride['oz_lotameid'], 'abbr': objOverride['oz_lotameid']}];
      return lotameData;
    }
    utils.logInfo('OZONE: makeLotameObjectFromOverride', 'Weird error - failed to find Profile.Audiences.Audience in lotame object. Will return the object as-is');
    return lotameData;
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
    if (arr.hasOwnProperty('ozstoredrequest')) {
      if (this.isValidPlacementId(arr.ozstoredrequest)) {
        utils.logInfo('OZONE: using GET ozstoredrequest ' + arr.ozstoredrequest + ' to replace placementId');
        return arr.ozstoredrequest;
      } else {
        utils.logError('OZONE: GET ozstoredrequest FAILED VALIDATION - will not use it');
      }
    }
    return null;
  },
  /**
   * Produces external userid object
   */
  addExternalUserId(eids, value, source, atype) {
    if (utils.isStr(value)) {
      eids.push({
        source,
        uids: [{
          id: value,
          atype
        }]
      });
    }
  },
  /**
   * Generate an object we can append to the auction request, containing user data formatted correctly for different ssps
   * @param validBidRequests
   * @return {Array}
   */
  generateEids(validBidRequests) {
    let eids = [];
    this.handleTTDId(eids, validBidRequests);
    const bidRequest = validBidRequests[0];
    if (bidRequest && bidRequest.userId) {
      this.addExternalUserId(eids, utils.deepAccess(bidRequest, `userId.pubcid`), 'pubcid', 1);
      this.addExternalUserId(eids, utils.deepAccess(bidRequest, `userId.pubcid`), 'pubcommon', 1);
      this.addExternalUserId(eids, utils.deepAccess(bidRequest, `userId.id5id`), 'id5-sync.com', 1);
      this.addExternalUserId(eids, utils.deepAccess(bidRequest, `userId.criteortus.${BIDDER_CODE}.userid`), 'criteortus', 1);
      this.addExternalUserId(eids, utils.deepAccess(bidRequest, `userId.idl_env`), 'liveramp.com', 1);
      this.addExternalUserId(eids, utils.deepAccess(bidRequest, `userId.lipb.lipbid`), 'liveintent.com', 1);
      this.addExternalUserId(eids, utils.deepAccess(bidRequest, `userId.parrableid`), 'parrable.com', 1);
    }
    return eids;
  },
  handleTTDId(eids, validBidRequests) {
    let ttdId = null;
    let adsrvrOrgId = config.getConfig('adsrvrOrgId');
    if (utils.isStr(utils.deepAccess(validBidRequests, '0.userId.tdid'))) {
      ttdId = validBidRequests[0].userId.tdid;
    } else if (adsrvrOrgId && utils.isStr(adsrvrOrgId.TDID)) {
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
   * This will be called IF we want to enforce gdpr on the client
   * Do we have to block this request? Could be due to config values & gdpr permissions etc
   * @return {boolean|*[]} true = block the request, else false
   */
  blockTheRequest(bidderRequest) {
    // if there is an ozone.oz_request = false then quit now.
    let ozRequest = config.getConfig('ozone.oz_request');
    if (typeof ozRequest == 'boolean' && !ozRequest) {
      utils.logWarn('OZONE: Will not allow auction : ozone.oz_request is set to false');
      return true;
    }
    // is there ozone.oz_enforceGdpr == true (ANYTHING else means don't enforce GDPR))
    let ozEnforce = config.getConfig('ozone.oz_enforceGdpr');
    if (typeof ozEnforce != 'boolean' || !ozEnforce) { // ozEnforce is false by default
      utils.logWarn('OZONE: Will not validate GDPR on the client : oz_enforceGdpr is not set to true');
      return false;
    }
    // maybe the module was built without consentManagement module so we won't find any gdpr information
    if (!bidderRequest.hasOwnProperty('gdprConsent')) {
      return false;
    }
    //
    // FROM HERE ON : WE ARE DOING GDPR CHECKS
    //
    // If there is indeterminate GDPR (gdprConsent.consentString == undefined or not a string), we will DITCH this:
    if (typeof bidderRequest.gdprConsent.consentString !== 'string') {
      utils.logError('OZONE: Will block the request - bidderRequest.gdprConsent.consentString is not a string!');
      return true;
    }
    // IF the consentManagement module sends through the CMP information and user has refused all permissions:
    if (this.failsGdprCheck(bidderRequest)) {
      return true;
    }
    return false;
  },
  /**
   * Examine the gdpr information inside the bidderRequest and return the boolean answer to the question
   * @param bidderRequest
   * @return {boolean}
   */
  failsGdprCheck(bidderRequest) {
    let consentRequired = (typeof bidderRequest.gdprConsent.gdprApplies === 'boolean') ? bidderRequest.gdprConsent.gdprApplies : true;
    if (consentRequired) {
      let vendorConsentsObject = utils.deepAccess(bidderRequest.gdprConsent, 'vendorData');
      if (!vendorConsentsObject || typeof vendorConsentsObject !== 'object') {
        utils.logError('OZONE: gdpr test failed - bidderRequest.gdprConsent.vendorData is not an array');
        return true;
      }
      let vendorPurposeConsents, vendorVendorConsents;
      if (bidderRequest.gdprConsent.apiVersion === 2) { // cater for TCF2.0 and also 1.1
        vendorPurposeConsents = utils.deepAccess(vendorConsentsObject, 'purpose.consents');
        vendorVendorConsents = utils.deepAccess(vendorConsentsObject, 'vendor.consents');
      } else {
        vendorPurposeConsents = utils.deepAccess(vendorConsentsObject, 'purposeConsents');
        vendorVendorConsents = utils.deepAccess(vendorConsentsObject, 'vendorConsents');
      }
      if (typeof vendorPurposeConsents != 'object') {
        return true;
      }
      if (!this.purposeConsentsAreOk((vendorPurposeConsents))) {
        utils.logWarn('OZONE: gdpr test failed - lacking some required Purposes consent(s): consents=', vendorPurposeConsents);
        return true;
      }
      if (!vendorVendorConsents[524]) {
        utils.logWarn('OZONE: gdpr test failed - missing Vendor ID consent');
        return true;
      }
    }
    return false;
  },
  /**
   * Test that vendor purpose consents 1,2,3,4 and 5 are true
   * This is because we can't use Object.values(vendorConsentsObject.purposeConsents).slice(0, 5)
   * @param obj
   * @return {boolean}
   */
  purposeConsentsAreOk(obj) {
    for (let i = 1; i <= 5; i++) {
      if (!obj.hasOwnProperty(i) || !obj[i]) return false;
    }
    return true;
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
    return this.propertyBag.pageId;
  },
  /**
   * handle the complexity of there possibly being lotameData override (may be valid/invalid) & there may or may not be lotameData present in the bidRequest
   * NOTE THAT this will also set this.propertyBag.lotameWasOverridden=1 if we use lotame override
   * @param ozoneBidRequest
   * @return object representing the absolute lotameData we need to use.
   */
  tryGetLotameData: function(ozoneBidRequest) {
    const arrLotameOverride = this.getLotameOverrideParams();
    let ret = {};
    if (Object.keys(arrLotameOverride).length === ALLOWED_LOTAME_PARAMS.length) {
      // all override params are present, override lotame object:
      if (ozoneBidRequest.params.hasOwnProperty('lotameData')) {
        ret = this.makeLotameObjectFromOverride(arrLotameOverride, ozoneBidRequest.params.lotameData);
      } else {
        ret = this.makeLotameObjectFromOverride(arrLotameOverride, {});
      }
      this.propertyBag.lotameWasOverridden = 1;
    } else if (ozoneBidRequest.params.hasOwnProperty('lotameData')) {
      // no lotame override, use it as-is
      if (this.isLotameDataValid(ozoneBidRequest.params.lotameData)) {
        ret = ozoneBidRequest.params.lotameData;
      } else {
        utils.logError('OZONE: INVALID LOTAME DATA FOUND - WILL NOT USE THIS AT ALL ELSE IT MIGHT BREAK THE AUCTION CALL!', ozoneBidRequest.params.lotameData);
        ret = {};
      }
    }
    return ret;
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
    let arrVideoKeysAllowed = ['mimes', 'minduration', 'maxduration', 'protocols', 'w', 'h', 'startdelay', 'placement', 'linearity', 'skip', 'skipmin', 'skipafter', 'sequence', 'battr', 'maxextended', 'minbitrate', 'maxbitrate', 'boxingallowed', 'playbackmethod', 'playbackend', 'delivery', 'pos', 'companionad', 'api', 'companiontype', 'ext'];
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
    let context = utils.deepAccess(objConfig, 'context');
    if (context === 'outstream') {
      objRet.placement = 3;
    }
    let skippable = utils.deepAccess(objConfig, 'skippable', null);
    if (skippable == null) {
      if (addIfMissing && !objRet.hasOwnProperty('skip')) {
        objRet.skip = skippable ? 1 : 0;
      }
    } else {
      objRet.skip = skippable ? 1 : 0;
    }
    return objRet;
  },
  isOpenRtbCompliantMode() {
    let match = document.location.search.match('openrtb=(true|false)');
    if (match) {
      return match[1] === 'true' ? true : match[1] === 'false' ? false : OPENRTB_COMPLIANT;
    }
    return OPENRTB_COMPLIANT;
  }
};

/**
 * add a page-level-unique adId element to all server response bids.
 * NOTE that this is distructive - it mutates the serverResponse object sent in as a parameter
 * @param seatbid  object (serverResponse.seatbid)
 * @returns seatbid object
 */
export function injectAdIdsIntoAllBidResponses(seatbid) {
  utils.logInfo('OZONE: injectAdIdsIntoAllBidResponses', seatbid);
  for (let i = 0; i < seatbid.length; i++) {
    let sb = seatbid[i];
    for (let j = 0; j < sb.bid.length; j++) {
      // modify the bidId per-bid, so each bid has a unique adId within this response, and dfp can select one.
      sb.bid[j]['adId'] = sb.bid[j]['impid'] + '-' + i;
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
    utils.logInfo('OZONE: defaultSize received empty bid obj! going to return fixed default size');
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
 * @param requestBid
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
 * Get a list of all the bids, for this bidId
 * @param matchBidId
 * @param serverResponseSeatBid
 * @returns {} = {ozone:{obj}, appnexus:{obj}, ... }
 */
export function ozoneGetAllBidsForBidId(matchBidId, serverResponseSeatBid) {
  let objBids = {};
  for (let j = 0; j < serverResponseSeatBid.length; j++) {
    let theseBids = serverResponseSeatBid[j].bid;
    let thisSeat = serverResponseSeatBid[j].seat;
    for (let k = 0; k < theseBids.length; k++) {
      if (theseBids[k].impid === matchBidId) {
        objBids[thisSeat] = theseBids[k];
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

  utils.logInfo('OZONE: getRoundedBid. price:', price, 'mediaType:', mediaType, 'configkey:', theConfigKey, 'configObject:', theConfigObject, 'mediaTypeGranularity:', mediaTypeGranularity, 'strBuckets:', strBuckets);

  let priceStringsObj = getPriceBucketString(
    price,
    theConfigObject,
    config.getConfig('currency.granularityMultiplier')
  );
  utils.logInfo('OZONE: priceStringsObj', priceStringsObj);
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
    utils.logInfo('OZONE: looking for priceStringsKey:', priceStringsKey);
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
 * @param bid object = the seatbid (response) bid
 * @param requestBid = the matching request bid (on bidId)
 * @return {{callback: (function(): void), url: string}}
 */
function createObjectForInternalVideoRender(bid, requestBid) {
  let qs = '';
  if (typeof requestBid == 'object') {
    qs = `?publisherId=${utils.deepAccess(requestBid, 'params.publisherId')}&siteId=${utils.deepAccess(requestBid, 'params.siteId')}&placementId=${utils.deepAccess(requestBid, 'params.placementId')}`;
  }
  let obj = {
    url: OZONE_RENDERER_URL + qs,
    callback: () => onOutstreamRendererLoaded(bid)
  };
  return obj;
}

// this caused all kinds of problems with timing; renderer not loaded when the ad needed to be rendered.
// function onOutstreamRendererLoaded(bid) {
//   utils.logInfo('onOutstreamRendererLoaded');
//   try {
//     bid.renderer.setRender(outstreamRender);
//   } catch (err) {
//     utils.logWarn('OZONE: Prebid Error calling setRender on renderer', err);
//   }
// }
/**
 * Simple reporting only now.
 * @param bid
 */
function onOutstreamRendererLoaded(bid) {
  utils.logInfo(`OZONE: onOutstreamRendererLoaded for bid: ${bid}`);
}

/**
 * This can be called early - it's intelligent now & can retry if the renderer is not yet loaded into the page
 * @param bid
 */
function outstreamRender(bid) {
  if (window.hasOwnProperty('ozoneVideo')) {
    utils.logInfo('OZONE: outstreamRender rendering immediately');
    window.ozoneVideo.outstreamRender(bid);
  } else {
    utils.logInfo('OZONE: outstreamRender deferring the render...');
    ozTryLocateRenderer(bid, 20, 200);
  }
}
function ozTryLocateRenderer(bid, count, ms) {
  utils.logInfo(`OZONE: outstreamRender trying to locate the render... ${count} attempts left, wait=${ms}ms`);
  if (window.hasOwnProperty('ozoneVideo')) {
    window.ozoneVideo.outstreamRender(bid);
    return;
  }
  if (count > 0) {
    setTimeout(function() { ozTryLocateRenderer(bid, --count, ms); }, ms);
  }
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
    utils.logInfo('OZONE: getWidthAndHeightFromVideoObject found nested array inside playerSize.', playerSize[0]);
    playerSize = playerSize[0];
    if (typeof playerSize[0] !== 'number' && typeof playerSize[0] !== 'string') {
      utils.logInfo('OZONE: getWidthAndHeightFromVideoObject found non-number/string type inside the INNER array in playerSize. This is totally wrong - cannot continue.', playerSize[0]);
      return null;
    }
  }
  if (playerSize.length !== 2) {
    utils.logInfo('OZONE: getWidthAndHeightFromVideoObject found playerSize with length of ' + playerSize.length + '. This is totally wrong - cannot continue.');
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
  utils.logInfo('OZONE: getPlayerSizeFromObject received object', objVideo);
  let playerSize = utils.deepAccess(objVideo, 'playerSize');
  if (!playerSize) {
    playerSize = utils.deepAccess(objVideo, 'ext.playerSize');
  }
  if (!playerSize) {
    utils.logError('OZONE: getPlayerSizeFromObject FAILED: no playerSize in video object or ext', objVideo);
    return null;
  }
  if (typeof playerSize !== 'object') {
    utils.logError('OZONE: getPlayerSizeFromObject FAILED: playerSize is not an object/array', objVideo);
    return null;
  }
  return playerSize;
}

registerBidder(spec);
utils.logInfo('OZONE: ozoneBidAdapter was loaded');
