/**
 * This module adds the Ozone Real-Time Data provider to Prebid.
 *
 * It fetches additional data from a configurable API endpoint BEFORE the auction
 * is sent, and writes it into the ortb2 first-party-data fragments so the Ozone
 * bid adapter (and any other adapter) can read it.
 *
 * IMPORTANT - placement of the data:
 * The Ozone bid adapter only forwards ortb2 paths that live under an `ext` key
 * within 2 levels of nesting (see pruneToExtPaths / maxTestDepth:2 in
 * ozoneBidAdapter.js). Anything written elsewhere (eg user.data[]) is dropped by
 * the adapter. So this provider writes under:
 *   - global : ortb2.site.ext.ozoneRtd  (and/or ortb2.user.ext.ozoneRtd)
 *   - imp    : ortb2Imp.ext.ozoneRtd    (per ad unit)
 *
 * =====================================================================
 * REQUIREMENTS & GOTCHAS (read before deploying)
 * =====================================================================
 *
 * 1. PRICE FLOORS MODULE MUST BE ENABLED, WITH A BASE CONFIG.
 *    Floors from the API are applied by WRAPPING each bid's getFloor() (see
 *    applyFloors). We only wrap bids that already have getFloor(), i.e. the floors
 *    module is active for the auction. So the publisher must include the
 *    `priceFloors` module AND set at least a minimal base config BEFORE the first
 *    requestBids, eg:
 *      pbjs.setConfig({ floors: { data: { schema: { fields: ['mediaType'] }, values: { '*': 0.01 } } } });
 *
 * 2. AD UNITS MUST DECLARE mediaTypes (not legacy top-level `sizes`).
 *    Ozone's floor path (getFloorObjectForAuction / imp.bidfloor) only runs for
 *    ad units with a `mediaTypes` object. A legacy `sizes`-only ad unit will NOT
 *    get obj.floor or imp.bidfloor. Other adapters that call getFloor() directly
 *    are unaffected, but for Ozone, ensure ad units use mediaTypes.
 *
 * 3. THE PROVIDER MUST BE TOLD TO BLOCK THE AUCTION.
 *    Floors must arrive before bids are built. Set BOTH on the publisher page,
 *    or the auction will proceed without waiting for the API:
 *      realTimeData.auctionDelay > 0   (>= your API latency + margin)
 *      dataProviders[].waitForIt: true (on THIS provider's entry, not in params)
 *    The provider caps params.timeout slightly below auctionDelay so its callback
 *    always runs before Prebid releases the auction.
 *
 * 4. OUR FLOOR IS A Math.max, NOT AN OVERRIDE.
 *    The getFloor() wrapper returns max(ourFloor, publisherFloor). Our floor RAISES
 *    the floor to the API value but will not lower a higher publisher floor rule.
 *
 * 5. WHY A getFloor() WRAPPER (and not floorMin / config data).
 *    The floors module CACHES getFloor() results on shared per-auction data, keyed
 *    only by its schema fields (not the bidder) - so a per-bid ortb2Imp.floorMin
 *    set on the first bid is cached and returned for every other bid (all bidders /
 *    ad units get the same floor). Wrapping getFloor() per bid bypasses that cache.
 *    Also do NOT feed the floors module its rule data
 *    (config.setConfig({floors:{data}}) / adUnit.floors / createFloorsDataForAuction
 *    / the test-only _floorDataForAuction export): those are read BEFORE this hook,
 *    so they land on the next auction and/or couple to Prebid internals.
 *    See the block comment on applyFloors.
 *
 * 6. SINGLE SOURCE OF FLOORS.
 *    Both `floors` (per ad unit) and `floorsByBidder` (per Prebid bidder) are
 *    consumed ONLY via the getFloor() wrapper; neither is duplicated into
 *    site.ext.ozoneRtd. Only non-floor data is forwarded to the Ozone endpoint
 *    via site.ext.ozoneRtd.
 *
 * 7. PER-BIDDER FLOORS (`floorsByBidder`) - keys are TOP-LEVEL PREBID BIDDER CODES.
 *    For each bid we use the per-bidder floor if present, else the generic `floors`
 *    ad-unit floor, and wrap that bid's getFloor(). adapterManager.getBids() copies
 *    the wrapped getFloor onto each per-bidder bid request, so every adapter gets
 *    its own floor on the current auction.
 *    NOTE: Ozone is a single Prebid bidder, so this gives Ozone ONE floor (the
 *    `ozone` entry); it cannot express floors for individual seats/SSPs inside the
 *    Ozone server. (Prebid's floors module also has no native `bidder` rule
 *    dimension - allowedFields are gptSlot/adUnitCode/size/domain/mediaType - and
 *    its `additionalSchemaFields` bidder dimension lives in floors.data, read
 *    before this hook, so it suits STATIC floors only, not RTD-fetched ones.)
 *
 * 8. CURRENCY: our floor currency is sent verbatim (defaulting to USD). There is
 *    no currency conversion here; the floors/currency modules handle that at
 *    getFloor() time if a converting currency config is present.
 *
 * @module modules/ozoneRtdProvider
 */
import { submodule } from '../src/hook.js';
import { qualifiedAjaxBuilder } from '../src/ajax.js';
import adapterManager from '../src/adapterManager.js';
import { MODULE_TYPE_RTD } from '../src/activities/modules.js';
import { deepClone, deepSetValue, isPlainObject, logError, logInfo, logWarn, mergeDeep, timestamp } from '../src/utils.js';

/**
 * @typedef {import('../modules/rtdModule/index.js').RtdSubmodule} RtdSubmodule
 */

const REAL_TIME_MODULE = 'realTimeData';
const MODULE_NAME = 'ozoneRtd';
export const MODULE_VERSION = '0.3'; // bidders with no floor from the endpoint do not have any floor sent to their auction endpoint
const OZONE_BIDDER = 'ozone';
// where, under an `ext` object, this provider parks its payload
const DATA_KEY = 'ozoneRtd';
const DEFAULT_TIMEOUT_MS = 250;
const RTD_TIMEOUT_MARGIN_MS = 20;
const DEFAULT_ENDPOINT = 'https://elb.the-ozone-project.com/dfp-api/v1/floors';

// Injection seam for the network call so unit tests can stub it without
// touching the global ajax mock (see insuradsRtdProvider / mobianRtdProvider).
export const dep = { ajax: qualifiedAjaxBuilder(MODULE_TYPE_RTD, MODULE_NAME) };

function buildOzoneRtdFloorData(floorConfig, floor, currency, params) {
  return {
    floorValue: floor,
    floorRule: floorConfig?.floorRule || floorConfig?.rule || floorConfig?.ruleId || '',
    floorRuleValue: floorConfig?.floorRuleValue ?? floorConfig?.declaredFloor,
    floorCurrency: currency,
    enforcements: floorConfig?.enforcements || {},
    matchedFields: {
      mediaType: params?.mediaType || ''
    }
  };
}

function storeOzoneRtdFloorData(reqBidsConfigObj, adUnit, bid, floorData) {
  bid.ozoneRtdFloorData = floorData;
}

/**
 * Validate publisher config. Returning false disables the submodule.
 * @param {Object} config the dataProviders[] entry for this submodule
 * @returns {boolean}
 */
function init(config) {
  // note we are now using the default live endpoint
  // const endpoint = config?.params?.endpoint;
  // if (!endpoint || typeof endpoint !== 'string') {
  //   logError(`${MODULE_NAME}: missing or invalid params.endpoint, submodule disabled`);
  //   return false;
  // }
  return true;
}

/**
 * Merge the fetched payload into the global ortb2 fragment, in an ext-safe
 * location. The server returns a simple flat object eg {"key1":"val1",...} which
 * is parked wholesale under <target>.ext.ozoneRtd so the Ozone adapter forwards it.
 * @param {Object} reqBidsConfigObj the object Prebid passes to getBidRequestData
 * @param {Object} data the parsed API response (a flat key/value object)
 * @param {Object} params the submodule params
 */
export function writeData(reqBidsConfigObj, data, params) {
  logInfo(`${MODULE_NAME}: writeData reqBidsConfigObj`, deepClone(reqBidsConfigObj));
  logInfo(`${MODULE_NAME}: writeData params`, deepClone(params));

  if (!isPlainObject(data)) {
    logError(`${MODULE_NAME}: API response was not an object, nothing merged`, data);
    return;
  }
  const target = params?.target || 'site'; // 'site' | 'user'
  const global = reqBidsConfigObj.ortb2Fragments?.global;
  if (global) {
    // eg ortb2.site.ext.ozoneRtd = {key1: val1, key2: val2}
    deepSetValue(global, `${target}.ext.${DATA_KEY}`, mergeDeep({}, global?.[target]?.ext?.[DATA_KEY], data));
    logInfo(`${MODULE_NAME}: merged data into global ortb2.${target}.ext.${DATA_KEY}`, data);
  }
}

/**
 * Apply per-ad-unit (`floors`) and per-bidder (`floorsByBidder`) floors to the
 * CURRENT auction for EVERY adapter, by WRAPPING each bid's getFloor().
 *
 * Expected API response:
 *
 *   {
 *     "floors": {                              // generic per-ad-unit floor (fallback)
 *       "<adUnitCode>": { "declaredFloor": 0.45, "currency": "USD" }
 *     },
 *     "floorsByBidder": {                      // per-bidder override
 *       "<adUnitCode>": {
 *         "<prebidBidderCode>": { "declaredFloor": 0.35, "currency": "USD" },
 *         "<prebidBidderCode>": { "declaredFloor": 0.30, "currency": "USD" }
 *       }
 *     }
 *   }
 *
 * For each bid we pick the per-bidder floor if present, else the generic ad-unit
 * floor, and wrap that bid's getFloor() to return max(ourFloor, publisherFloor).
 * If neither contains a numeric floor, getFloor is removed from that bid so its
 * adapter sees the same request shape as when the floors module is not active.
 *
 * WHY a getFloor() WRAPPER and NOT ortb2Imp.ext.prebid.floors.floorMin:
 *
 *   The floors module CACHES getFloor() results on the SHARED per-auction floor
 *   data, keyed only by its schema fields (mediaType/size/...) - see
 *   getFirstMatchingFloor -> `matchingInputs`. The cache key never includes the
 *   bidder, and (unless the publisher schema includes adUnitCode/size) does not
 *   distinguish ad units either. A per-bid floorMin is read at call time but the
 *   RESULT is cached, so the FIRST bid's floor poisons the cache and every later
 *   bid with the same matching-input gets that value. (This is why every bidder /
 *   ad unit came back with the same floor.) Wrapping getFloor() bypasses the cache
 *   for our value - each bid's wrapper closes over its own floor.
 *
 * WHY this still reaches the current auction and every adapter:
 *   - The floors module attaches getFloor() to adUnit.bids[i] in its requestBids
 *     hook, which runs BEFORE this RTD startAuction hook, so getFloor() already
 *     exists for us to wrap.
 *   - adapterManager.getBids() then copies the (wrapped) getFloor onto each
 *     per-bidder bid request, so every adapter calls our wrapper.
 *
 * Requirements / semantics:
 *   - The Price Floors module must be ENABLED for the auction. We only wrap bids
 *     that already have getFloor() (ie the module is active); otherwise there is
 *     nothing to floor.
 *   - max(ourFloor, publisherFloor): we RAISE the floor to our value but never
 *     lower a higher publisher rule.
 *   - State lives on the per-auction adUnits only - nothing global, no leak.
 *   - floorsByBidder keys are TOP-LEVEL PREBID BIDDER CODES. Ozone is a single
 *     Prebid bidder, so a `ozone` entry gives Ozone ONE floor; it cannot express
 *     floors for individual seats/SSPs inside the Ozone server.
 *
 * @param {Object} reqBidsConfigObj the object Prebid passes to getBidRequestData
 * @param {Object} floors the per-ad-unit `floors` block (keyed by adUnitCode)
 * @param {Object} floorsByBidder the per-bidder block (keyed by adUnitCode then bidder)
 * @returns {number} how many bids had a floor wrapper applied
 */
export function applyFloors(reqBidsConfigObj, floors, floorsByBidder) {
  const byAdUnit = isPlainObject(floors) ? floors : {};
  const byBidder = isPlainObject(floorsByBidder) ? floorsByBidder : {};
  let applied = 0;
  (reqBidsConfigObj.adUnits || []).forEach((adUnit) => {
    const generic = byAdUnit[adUnit.code];
    const perBidder = byBidder[adUnit.code] || {};
    (adUnit.bids || []).forEach((bid) => {
      logInfo(`${MODULE_NAME}: applyFloors: bid: `, deepClone(bid), ` bidder ${bid.bidder} on adUnit ${adUnit.code}`);
      const f = perBidder[bid.bidder] || generic;
      const floor = parseFloat(f?.declaredFloor);
      // The base floors config exists only to activate the floors module before
      // this RTD hook. Remove its getFloor signal when RTD supplied no floor for
      // this bid; adapters must not receive placeholder/null floor fields.
      if (isNaN(floor)) {
        logInfo(`${MODULE_NAME}: applyFloors: no floor for bidder ${bid.bidder} on adUnit ${adUnit.code}, removing getFloor() wrapper & floorData if it exists`);
        delete bid.getFloor;
        if (bid.floorData) delete bid.floorData;
        bid.ignoreFloors = true;
        return;
      }
      logInfo(`${MODULE_NAME}: applyFloors: bidder ${bid.bidder} on adUnit ${adUnit.code} has declaredFloor ${floor}`);
      // only wrap when we have a numeric floor AND the floors module already
      // attached getFloor() to this bid (ie floors are active for the auction)
      if (typeof bid.getFloor !== 'function') return;
      const currency = f.currency || 'USD';
      const orig = bid.getFloor;
      storeOzoneRtdFloorData(reqBidsConfigObj, adUnit, bid, buildOzoneRtdFloorData(f, floor, currency));
      bid.getFloor = function (params) {
        const base = orig.call(this, params) || {};
        const baseFloor = typeof base.floor === 'number' ? base.floor : 0;
        const appliedFloor = Math.max(floor, baseFloor);
        const floorData = buildOzoneRtdFloorData(f, appliedFloor, currency, params);
        storeOzoneRtdFloorData(reqBidsConfigObj, adUnit, bid, floorData);
        // adapterManager clones ad-unit bids into bidder requests. getFloor() is
        // invoked as a method of that clone, so persist the exact value returned
        // to the adapter on the indexed request that analytics later retrieves.
        if (this !== bid) {
          storeOzoneRtdFloorData(reqBidsConfigObj, adUnit, this, floorData);
        }
        return { floor: appliedFloor, currency };
      };
      applied++;
    });
  });
  if (applied) logInfo(`${MODULE_NAME}: wrapped getFloor() on ${applied} bid(s) with RTD floors`);
  return applied;
}

/**
 * Summarise the auction request into a compact payload for the tailoring API.
 * Everything here is read from the auction request (reqBidsConfigObj) and the
 * consent arg - no globals. siteId / publisherId are carried on the ozone bid
 * params; device / page come from the merged ortb2 first-party data.
 * @param {Object} reqBidsConfigObj the object Prebid passes to getBidRequestData
 * @param {Object} userConsent GDPR / USP / GPP consent data
 * @param {Object} params the submodule params
 * @param {string} [params.testgroupKeyName] property name used to add test-group data to the payload
 * @param {*} [params.testgroupVal] test-group value added under `testgroupKeyName`
 * @returns {Object} the request body to POST to the API
 */
export function buildPayload(reqBidsConfigObj, userConsent, params) {
  logInfo(`${MODULE_NAME}: buildPayload reqBidsConfigObj`, deepClone(reqBidsConfigObj));
  const ortb2 = reqBidsConfigObj?.ortb2Fragments?.global || {};
  const adUnits = reqBidsConfigObj?.adUnits || [];

  // siteId / publisherId live on the ozone bid params; grab the first set found.
  let siteId, publisherId;
  for (const au of adUnits) {
    const ozoneBid = (au.bids || []).find(b => b.bidder === OZONE_BIDDER);
    if (ozoneBid?.params) {
      siteId = siteId || ozoneBid.params.siteId;
      publisherId = publisherId || ozoneBid.params.publisherId;
      if (siteId && publisherId) break;
    }
  }

  let ret = {
    version: MODULE_VERSION,
    prebid: '$prebid.version$',
    auctionId: reqBidsConfigObj?.auctionId,
    publisherId,
    siteId,
    // every bid adapter compiled into this Prebid build
    installedBidders: Object.keys(adapterManager.bidderRegistry || {}),
    page: {
      url: ortb2.site?.page,
      domain: ortb2.site?.domain,
      ref: ortb2.site?.ref,
      keywords: ortb2.site?.keywords
    },
    device: {
      w: ortb2.device?.w,
      h: ortb2.device?.h,
      ua: ortb2.device?.ua,
      language: ortb2.device?.language
    },
    adUnits: adUnits.map(au => ({
      code: au.code,
      gpid: au.ortb2Imp?.ext?.gpid,
      mediaTypes: Object.keys(au.mediaTypes || {}),
      sizes: au.mediaTypes?.banner?.sizes || au.sizes,
      bidders: (au.bids || []).map(b => b.bidder),
      ozoneParams: (au.bids || []).filter(b => b.bidder === OZONE_BIDDER).map(b => b.params)
    })),
    consent: {
      gdprApplies: userConsent?.gdpr?.gdprApplies,
      consentString: userConsent?.gdpr?.consentString,
      usp: userConsent?.usp,
      gpp: userConsent?.gpp?.gppString,
      gppSid: userConsent?.gpp?.applicableSections
    }
  };
  // 20260929 - look to see if there is testgroupKeyName, testgroupVal in the params
  let { testgroupKeyName, testgroupVal } = params;
  if (testgroupKeyName) {
    logInfo(`${MODULE_NAME}: going to add the testgroup info key:${testgroupKeyName} val:${testgroupVal}`);
    ret.testgroupKey = testgroupKeyName;
    ret.testgroupVal = testgroupVal.toString();
    ret.testgroup = testgroupVal.toString();
  }
  return ret;
}

/**
 * Build the ajax options for the call.
 * Defaults to POST so we can send the payload as a JSON body. A GET deliberately
 * carries NO Content-Type header: that keeps it a CORS "simple request" and
 * avoids a preflight OPTIONS round-trip (application/json is discouraged in this
 * repo for exactly that reason).
 * @param {Object} params the submodule params
 * @returns {Object} options for ajax()
 */
export function buildRequestOptions(params) {
  const method = (params?.method || 'POST').toUpperCase();
  const options = { method, withCredentials: !!params?.withCredentials };
  if (method === 'POST') {
    options.contentType = params?.contentType || 'text/plain';
  }
  return options;
}

/**
 * Called by the RTD module during requestBids. Prebid waits for callback()
 * (bounded by realTimeData.auctionDelay) before building bid requests.
 * @param {Object} reqBidsConfigObj
 * @param {function} callback signals Prebid this provider is done
 * @param {Object} config the dataProviders[] entry for this submodule
 * @param {Object} userConsent
 * @param {number} auctionDelay maximum time the RTD module will hold the auction
 */
function getBidRequestData(reqBidsConfigObj, callback, config, userConsent, auctionDelay) {
  logInfo(`${MODULE_NAME}: getBidRequestData config`, config);
  const params = config?.params || {};
  logInfo(`${MODULE_NAME}: getBidRequestData params`, deepClone(params));
  const options = buildRequestOptions(params);
  const suppliedTimeout = params.timeout;
  const parsedTimeout = Number(suppliedTimeout);
  const hasNumericTimeoutType = typeof suppliedTimeout === 'number' || (typeof suppliedTimeout === 'string' && suppliedTimeout.trim() !== '');
  const hasValidSuppliedTimeout = hasNumericTimeoutType && Number.isFinite(parsedTimeout) && parsedTimeout > 0;
  const configuredTimeout = hasValidSuppliedTimeout ? parsedTimeout : DEFAULT_TIMEOUT_MS;
  if (suppliedTimeout != null && !hasValidSuppliedTimeout) {
    logWarn(`${MODULE_NAME}: Invalid params.timeout value "${String(suppliedTimeout)}"; overriding it with the ${DEFAULT_TIMEOUT_MS}ms default.`);
  }

  const parsedAuctionDelay = Number(auctionDelay);
  const hasAuctionDelay = Number.isFinite(parsedAuctionDelay) && parsedAuctionDelay > 0;
  const safeAuctionTimeout = hasAuctionDelay
    ? Math.max(0, parsedAuctionDelay - RTD_TIMEOUT_MARGIN_MS)
    : configuredTimeout;
  const timeoutMs = Math.min(configuredTimeout, safeAuctionTimeout);
  if (hasAuctionDelay && configuredTimeout > safeAuctionTimeout) {
    const timeoutSource = hasValidSuppliedTimeout ? `params.timeout ${configuredTimeout}ms` : `default timeout ${configuredTimeout}ms`;
    logWarn(`${MODULE_NAME}: Invalid timeout configuration: ${timeoutSource} must finish before auctionDelay ${parsedAuctionDelay}ms; overriding the RTD timeout to ${timeoutMs}ms (${RTD_TIMEOUT_MARGIN_MS}ms safety margin).`);
  }
  const start = timestamp();

  let done = false;
  const finish = (floors, floorsByBidder) => {
    if (done) return;
    done = true;
    // The RTD response is the source of truth for floors. Missing response data
    // removes the floors-module signal from every unmatched bid, including on
    // timeout, network failure, and malformed JSON.
    applyFloors(reqBidsConfigObj, floors, floorsByBidder);
    callback();
  };

  // Hard safety net: never let a slow/failed API hold up the auction beyond timeoutMs.
  const timer = setTimeout(() => {
    logError(`${MODULE_NAME}: API call exceeded ${timeoutMs}ms, proceeding without data`);
    finish();
  }, timeoutMs);

  // Send the auction context up so the API can tailor its response.
  const payload = buildPayload(reqBidsConfigObj, userConsent, params);
  const body = options.method === 'POST' ? JSON.stringify(payload) : null;
  let theEndpoint = params.endpoint || DEFAULT_ENDPOINT;
  logInfo(`${MODULE_NAME}: requesting ${theEndpoint} with payload`, payload);

  dep.ajax(theEndpoint, {
    success: (responseText) => {
      clearTimeout(timer);
      if (done) return; // timed out already
      try {
        const data = JSON.parse(responseText);
        // Floors are applied via the price floors module (getFloor) - the single
        // source of floors for every adapter - so neither `floors` nor
        // `floorsByBidder` is duplicated into site.ext.ozoneRtd. Only the remaining
        // non-floor data is forwarded to the Ozone endpoint via site.ext.ozoneRtd.
        const { floors, floorsByBidder, ...rest } = data;
        if (Object.keys(rest).length) writeData(reqBidsConfigObj, rest, params);
        logInfo(`${MODULE_NAME}: enrichment applied in ${timestamp() - start}ms. data: ${JSON.stringify(data)}`);
        finish(floors, floorsByBidder);
        return;
      } catch (e) {
        logError(`${MODULE_NAME}: failed to parse API response`, e);
      }
      finish();
    },
    error: (err) => {
      clearTimeout(timer);
      logError(`${MODULE_NAME}: API call failed`, err);
      finish();
    }
  }, body, options);
}

/** @type {RtdSubmodule} */
export const ozoneRtdSubmodule = {
  name: MODULE_NAME,
  init,
  getBidRequestData
};

submodule(REAL_TIME_MODULE, ozoneRtdSubmodule);
