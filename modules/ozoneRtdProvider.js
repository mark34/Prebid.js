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
 * @module modules/ozoneRtdProvider
 */
import { submodule } from '../src/hook.js';
import { ajax } from '../src/ajax.js';
import { deepSetValue, isPlainObject, logError, logInfo, mergeDeep, timestamp } from '../src/utils.js';

/**
 * @typedef {import('../modules/rtdModule/index.js').RtdSubmodule} RtdSubmodule
 */

const REAL_TIME_MODULE = 'realTimeData';
const MODULE_NAME = 'ozoneRtd';
// where, under an `ext` object, this provider parks its payload
const DATA_KEY = 'ozoneRtd';
const DEFAULT_TIMEOUT_MS = 1000;

/**
 * Validate publisher config. Returning false disables the submodule.
 * @param {Object} config the dataProviders[] entry for this submodule
 * @returns {boolean}
 */
function init(config) {
  const endpoint = config?.params?.endpoint;
  if (!endpoint || typeof endpoint !== 'string') {
    logError(`${MODULE_NAME}: missing or invalid params.endpoint, submodule disabled`);
    return false;
  }
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
 * Called by the RTD module during requestBids. Prebid waits for callback()
 * (bounded by realTimeData.auctionDelay) before building bid requests.
 * @param {Object} reqBidsConfigObj
 * @param {function} callback signals Prebid this provider is done
 * @param {Object} config the dataProviders[] entry for this submodule
 * @param {Object} userConsent
 */
function getBidRequestData(reqBidsConfigObj, callback, config, userConsent) {
  const params = config?.params || {};
  const timeoutMs = Number(params.timeout) > 0 ? Number(params.timeout) : DEFAULT_TIMEOUT_MS;
  const start = timestamp();

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    callback();
  };

  // Hard safety net: never let a slow/failed API hold up the auction beyond timeoutMs.
  const timer = setTimeout(() => {
    logError(`${MODULE_NAME}: API call exceeded ${timeoutMs}ms, proceeding without data`);
    finish();
  }, timeoutMs);

  ajax(params.endpoint, {
    success: (responseText) => {
      clearTimeout(timer);
      if (done) return; // timed out already
      try {
        const data = JSON.parse(responseText);
        writeData(reqBidsConfigObj, data, params);
        logInfo(`${MODULE_NAME}: enrichment applied in ${timestamp() - start}ms`);
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
  }, params.requestBody || null, {
    method: params.method || 'GET',
    withCredentials: !!params.withCredentials,
    contentType: params.contentType || 'application/json'
  });
}

/** @type {RtdSubmodule} */
export const ozoneRtdSubmodule = {
  name: MODULE_NAME,
  init,
  getBidRequestData
};

submodule(REAL_TIME_MODULE, ozoneRtdSubmodule);
