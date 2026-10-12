import { ozoneRtdSubmodule, writeData, buildRequestOptions, buildPayload, applyFloors, dep } from 'modules/ozoneRtdProvider.js';
import adapterManager from 'src/adapterManager.js';
import * as utils from 'src/utils.js';

describe('Ozone RTD Provider', function () {
  let ajaxStub;

  afterEach(function () {
    if (ajaxStub) {
      ajaxStub.restore();
      ajaxStub = undefined;
    }
  });

  // Stub the module's own ajax seam (dep.ajax) so we control the response
  // without hitting the network or the global ajax mock.
  const stubAjaxSuccess = (responseText) => {
    ajaxStub = sinon.stub(dep, 'ajax').callsFake((url, callbacks) => callbacks.success(responseText));
  };
  const stubAjaxError = () => {
    ajaxStub = sinon.stub(dep, 'ajax').callsFake((url, callbacks) => callbacks.error('boom'));
  };

  // Drive getBidRequestData and resolve once the provider signals completion.
  const runGetBidRequestData = (reqBidsConfigObj, config, auctionDelay) =>
    new Promise((resolve) => ozoneRtdSubmodule.getBidRequestData(reqBidsConfigObj, resolve, config, undefined, auctionDelay));

  describe('init', function () {
    it('returns true when params.endpoint is missing and the default endpoint will be used', function () {
      expect(ozoneRtdSubmodule.init({ params: {} })).to.equal(true);
      expect(ozoneRtdSubmodule.init({})).to.equal(true);
    });

    it('returns true when params.endpoint is a non-empty string', function () {
      expect(ozoneRtdSubmodule.init({ params: { endpoint: 'https://example.com/rtd' } })).to.equal(true);
    });
  });

  describe('buildRequestOptions', function () {
    it('defaults to POST with a text/plain Content-Type to avoid CORS preflight', function () {
      const options = buildRequestOptions({});
      expect(options.method).to.equal('POST');
      expect(options.contentType).to.equal('text/plain');
    });

    it('does NOT set a Content-Type on a GET (avoids CORS preflight)', function () {
      const options = buildRequestOptions({ method: 'get' });
      expect(options.method).to.equal('GET');
      expect(options).to.not.have.property('contentType');
    });

    it('passes through withCredentials', function () {
      expect(buildRequestOptions({ withCredentials: true }).withCredentials).to.equal(true);
      expect(buildRequestOptions({}).withCredentials).to.equal(false);
    });
  });

  describe('buildPayload', function () {
    const reqBidsConfigObj = {
      auctionId: 'auction-123',
      ortb2Fragments: {
        global: {
          site: { page: 'https://pub.example/article', domain: 'pub.example' },
          device: { w: 1280, h: 800, language: 'en' }
        }
      },
      adUnits: [{
        code: 'div-1',
        mediaTypes: { banner: { sizes: [[300, 250], [300, 600]] } },
        ortb2Imp: { ext: { gpid: '/123/div-1' } },
        bids: [
          { bidder: 'ozone', params: { publisherId: 'OZONEPUB123', siteId: '1234567890', placementId: '0000000001' } },
          { bidder: 'appnexus', params: { placementId: 99 } }
        ]
      }]
    };
    const userConsent = { gdpr: { gdprApplies: true, consentString: 'CONSENT' }, usp: '1YNN' };

    it('includes the installed bid adapters from the build', function () {
      // In an isolated unit bundle no real bidders are registered, so fake one.
      adapterManager.bidderRegistry.ozone = adapterManager.bidderRegistry.ozone || {};
      try {
        const payload = buildPayload(reqBidsConfigObj, userConsent, {});
        expect(payload.installedBidders).to.be.an('array');
        expect(payload.installedBidders).to.include('ozone');
      } finally {
        delete adapterManager.bidderRegistry.ozone;
      }
    });

    it('lifts siteId / publisherId off the ozone bid params', function () {
      const payload = buildPayload(reqBidsConfigObj, userConsent, {});
      expect(payload.publisherId).to.equal('OZONEPUB123');
      expect(payload.siteId).to.equal('1234567890');
    });

    it('summarises ad units (code, gpid, sizes, bidders, ozone params)', function () {
      const payload = buildPayload(reqBidsConfigObj, userConsent, {});
      expect(payload.adUnits).to.have.length(1);
      const au = payload.adUnits[0];
      expect(au.code).to.equal('div-1');
      expect(au.gpid).to.equal('/123/div-1');
      expect(au.mediaTypes).to.deep.equal(['banner']);
      expect(au.sizes).to.deep.equal([[300, 250], [300, 600]]);
      expect(au.bidders).to.deep.equal(['ozone', 'appnexus']);
      expect(au.ozoneParams[0].placementId).to.equal('0000000001');
    });

    it('includes page, device and consent context', function () {
      const payload = buildPayload(reqBidsConfigObj, userConsent, {});
      expect(payload.page.url).to.equal('https://pub.example/article');
      expect(payload.device.w).to.equal(1280);
      expect(payload.consent.gdprApplies).to.equal(true);
      expect(payload.consent.consentString).to.equal('CONSENT');
      expect(payload.consent.usp).to.equal('1YNN');
    });

    it('does not throw on an empty request object', function () {
      const payload = buildPayload({}, undefined, {});
      expect(payload.adUnits).to.deep.equal([]);
      expect(payload.installedBidders).to.be.an('array');
    });

    it('adds the configured test-group key and value to the payload', function () {
      const payload = buildPayload(reqBidsConfigObj, userConsent, {
        testgroupKeyName: 'testGroup',
        testgroupVal: 'variant-a'
      });
      expect(payload.testgroupKey).to.equal('testGroup');
      expect(payload.testgroupVal).to.equal('variant-a');
    });
  });

  describe('writeData (ext-safe placement for the Ozone adapter)', function () {
    let reqBidsConfigObj;
    beforeEach(function () {
      reqBidsConfigObj = { ortb2Fragments: { global: {} }, adUnits: [] };
    });

    it('writes the flat server object under site.ext (survives pruneToExtPaths maxTestDepth:2)', function () {
      writeData(reqBidsConfigObj, { key1: 'val1', key2: 'val2' }, { target: 'site' });
      expect(reqBidsConfigObj.ortb2Fragments.global.site.ext.ozoneRtd).to.deep.equal({ key1: 'val1', key2: 'val2' });
    });

    it('honours target=user', function () {
      writeData(reqBidsConfigObj, { key1: 'val1' }, { target: 'user' });
      expect(reqBidsConfigObj.ortb2Fragments.global.user.ext.ozoneRtd).to.deep.equal({ key1: 'val1' });
    });

    it('defaults target to site', function () {
      writeData(reqBidsConfigObj, { key1: 'val1' }, {});
      expect(reqBidsConfigObj.ortb2Fragments.global.site.ext.ozoneRtd).to.deep.equal({ key1: 'val1' });
    });

    it('ignores a non-object API response', function () {
      writeData(reqBidsConfigObj, 'not-an-object', {});
      expect(reqBidsConfigObj.ortb2Fragments.global).to.deep.equal({});
    });
  });

  describe('applyFloors', function () {
    // each bid starts with a floors-module getFloor() returning a low base floor
    const makeReq = () => ({
      adUnits: [{
        code: 'mpu',
        bids: [
          { bidder: 'ozone', getFloor: () => ({ floor: 0.05, currency: 'USD' }) },
          { bidder: 'appnexus', getFloor: () => ({ floor: 0.05, currency: 'USD' }) }
        ]
      }, {
        code: 'leaderboard',
        bids: [
          { bidder: 'ozone', getFloor: () => ({ floor: 0.05, currency: 'USD' }) },
          { bidder: 'appnexus', getFloor: () => ({ floor: 0.05, currency: 'USD' }) }
        ]
      }]
    });

    it('wraps each bid getFloor with its own per-bidder floor - no cross-bidder or cross-adunit bleed', function () {
      const req = makeReq();
      const applied = applyFloors(req,
        { mpu: { declaredFloor: 0.40 }, leaderboard: { declaredFloor: 0.45 } },
        {
          mpu: { ozone: { declaredFloor: 0.20, currency: 'USD' }, appnexus: { declaredFloor: 0.25, currency: 'USD' } },
          leaderboard: { ozone: { declaredFloor: 0.30, currency: 'USD' }, appnexus: { declaredFloor: 0.35, currency: 'USD' } }
        });
      expect(applied).to.equal(4);
      expect(req.adUnits[0].bids[0].getFloor().floor).to.equal(0.20); // mpu / ozone
      expect(req.adUnits[0].bids[1].getFloor().floor).to.equal(0.25); // mpu / appnexus
      expect(req.adUnits[1].bids[0].getFloor().floor).to.equal(0.30); // leaderboard / ozone
      expect(req.adUnits[1].bids[1].getFloor().floor).to.equal(0.35); // leaderboard / appnexus
    });

    it('falls back to the generic ad-unit floor for bidders without a per-bidder entry', function () {
      const req = makeReq();
      applyFloors(req, { mpu: { declaredFloor: 0.40 } }, { mpu: { appnexus: { declaredFloor: 0.25 } } });
      expect(req.adUnits[0].bids[0].getFloor().floor).to.equal(0.40); // ozone -> generic
      expect(req.adUnits[0].bids[1].getFloor().floor).to.equal(0.25); // appnexus -> specific
    });

    it('removes getFloor only from bidders without RTD floor data', function () {
      const req = makeReq();
      const applied = applyFloors(req, {}, {
        mpu: { appnexus: { declaredFloor: 0.25, currency: 'USD' } }
      });
      expect(applied).to.equal(1);
      expect(req.adUnits[0].bids[0]).to.not.have.property('getFloor'); // mpu / ozone
      expect(req.adUnits[0].bids[1].getFloor()).to.deep.equal({ floor: 0.25, currency: 'USD' });
      expect(req.adUnits[1].bids[0]).to.not.have.property('getFloor');
      expect(req.adUnits[1].bids[1]).to.not.have.property('getFloor');
    });

    it('returns max(ourFloor, publisherFloor) - never lowers a higher publisher floor', function () {
      const req = { adUnits: [{ code: 'mpu', bids: [{ bidder: 'ozone', getFloor: () => ({ floor: 0.9, currency: 'USD' }) }] }] };
      applyFloors(req, { mpu: { declaredFloor: 0.40 } }, {});
      expect(req.adUnits[0].bids[0].getFloor().floor).to.equal(0.9);
    });

    it('does not wrap bids without getFloor (floors module inactive)', function () {
      const req = { adUnits: [{ code: 'mpu', bids: [{ bidder: 'ozone' }] }] };
      expect(applyFloors(req, { mpu: { declaredFloor: 0.40 } }, {})).to.equal(0);
      expect(req.adUnits[0].bids[0].getFloor).to.equal(undefined);
    });

    it('removes getFloor from every bid when there are no RTD floors', function () {
      const req = makeReq();
      expect(applyFloors(req, undefined, undefined)).to.equal(0);
      req.adUnits.forEach(adUnit => adUnit.bids.forEach(bid => {
        expect(bid).to.not.have.property('getFloor');
      }));
    });
  });

  describe('getBidRequestData', function () {
    let reqBidsConfigObj;
    const config = { params: { endpoint: 'https://example.com/rtd' } };
    beforeEach(function () {
      reqBidsConfigObj = { ortb2Fragments: { global: {} }, adUnits: [] };
    });

    const addFloorEnabledBids = () => {
      reqBidsConfigObj.adUnits = [{
        code: 'mpu',
        bids: [
          { bidder: 'ozone', getFloor: () => ({ floor: null, currency: 'USD' }) },
          { bidder: 'appnexus', getFloor: () => ({ floor: null, currency: 'USD' }) }
        ]
      }];
      return reqBidsConfigObj.adUnits[0].bids;
    };

    it('merges the fetched data and calls the callback on success', async function () {
      stubAjaxSuccess(JSON.stringify({ key1: 'val1', key2: 'val2' }));
      await runGetBidRequestData(reqBidsConfigObj, config);
      expect(reqBidsConfigObj.ortb2Fragments.global.site.ext.ozoneRtd).to.deep.equal({ key1: 'val1', key2: 'val2' });
    });

    it('applies floors & floorsByBidder via the getFloor wrapper, and duplicates neither into site.ext.ozoneRtd', async function () {
      reqBidsConfigObj.adUnits = [{
        code: 'mpu',
        bids: [
          { bidder: 'ozone', getFloor: () => ({ floor: 0.05, currency: 'USD' }) },
          { bidder: 'appnexus', getFloor: () => ({ floor: 0.05, currency: 'USD' }) }
        ]
      }];
      stubAjaxSuccess(JSON.stringify({
        floors: { mpu: { declaredFloor: 0.45, currency: 'USD' } },
        floorsByBidder: { mpu: { appnexus: { declaredFloor: 0.6, currency: 'USD' } } }
      }));
      await runGetBidRequestData(reqBidsConfigObj, config);
      const au = reqBidsConfigObj.adUnits[0];
      expect(au.bids[0].getFloor().floor).to.equal(0.45); // ozone -> generic ad-unit floor
      expect(au.bids[1].getFloor().floor).to.equal(0.6);  // appnexus -> per-bidder floor
      // no floor data duplicated into site.ext.ozoneRtd (nothing else in the response -> no site at all)
      expect(reqBidsConfigObj.ortb2Fragments.global.site).to.equal(undefined);
    });

    it('removes getFloor from a bidder omitted by the RTD floor response', async function () {
      const bids = addFloorEnabledBids();
      stubAjaxSuccess(JSON.stringify({
        floors: {},
        floorsByBidder: { mpu: { appnexus: { declaredFloor: 0.25, currency: 'USD' } } }
      }));
      await runGetBidRequestData(reqBidsConfigObj, config);
      expect(bids[0]).to.not.have.property('getFloor');
      expect(bids[1].getFloor()).to.deep.equal({ floor: 0.25, currency: 'USD' });
    });

    it('POSTs the auction payload as a JSON body to the configured endpoint', async function () {
      stubAjaxSuccess('{}');
      reqBidsConfigObj.auctionId = 'auction-xyz';
      await runGetBidRequestData(reqBidsConfigObj, config);
      const [url, , body, options] = ajaxStub.firstCall.args;
      expect(url).to.equal('https://example.com/rtd');
      expect(options.method).to.equal('POST');
      expect(options.contentType).to.equal('text/plain');
      expect(JSON.parse(body).auctionId).to.equal('auction-xyz');
    });

    it('calls the callback and does not throw on malformed JSON', async function () {
      const bids = addFloorEnabledBids();
      stubAjaxSuccess('{not json');
      await runGetBidRequestData(reqBidsConfigObj, config);
      expect(reqBidsConfigObj.ortb2Fragments.global).to.deep.equal({});
      bids.forEach(bid => expect(bid).to.not.have.property('getFloor'));
    });

    it('calls the callback on a network error without writing data', async function () {
      const bids = addFloorEnabledBids();
      stubAjaxError();
      await runGetBidRequestData(reqBidsConfigObj, config);
      expect(reqBidsConfigObj.ortb2Fragments.global).to.deep.equal({});
      bids.forEach(bid => expect(bid).to.not.have.property('getFloor'));
    });

    it('falls back to a timeout when the API never responds', async function () {
      const bids = addFloorEnabledBids();
      ajaxStub = sinon.stub(dep, 'ajax'); // never invokes callbacks
      await runGetBidRequestData(reqBidsConfigObj, { params: { endpoint: 'https://example.com/rtd', timeout: 20 } });
      expect(reqBidsConfigObj.ortb2Fragments.global).to.deep.equal({});
      bids.forEach(bid => expect(bid).to.not.have.property('getFloor'));
    });

    it('times out before the RTD auction delay when its configured timeout is longer', async function () {
      const clock = sinon.useFakeTimers();
      ajaxStub = sinon.stub(dep, 'ajax'); // never invokes callbacks
      const logWarnStub = sinon.stub(utils, 'logWarn');
      try {
        let completed = false;
        const request = runGetBidRequestData(
          reqBidsConfigObj,
          { params: { endpoint: 'https://example.com/rtd', timeout: 1000 } },
          300
        ).then(() => { completed = true; });

        await clock.tickAsync(279);
        expect(completed).to.equal(false);
        await clock.tickAsync(1);
        await request;
        expect(completed).to.equal(true);
        expect(logWarnStub.calledOnceWithExactly(
          'ozoneRtd: Invalid timeout configuration: params.timeout 1000ms must finish before auctionDelay 300ms; overriding the RTD timeout to 280ms (20ms safety margin).'
        )).to.equal(true);
      } finally {
        logWarnStub.restore();
        clock.restore();
      }
    });

    it('keeps the configured timeout when there is no RTD auction delay', async function () {
      const clock = sinon.useFakeTimers();
      ajaxStub = sinon.stub(dep, 'ajax'); // never invokes callbacks
      try {
        let completed = false;
        const request = runGetBidRequestData(
          reqBidsConfigObj,
          { params: { endpoint: 'https://example.com/rtd', timeout: 100 } },
          0
        ).then(() => { completed = true; });

        await clock.tickAsync(99);
        expect(completed).to.equal(false);
        await clock.tickAsync(1);
        await request;
        expect(completed).to.equal(true);
      } finally {
        clock.restore();
      }
    });

    it('logs and replaces an explicitly invalid configured timeout', async function () {
      const clock = sinon.useFakeTimers();
      ajaxStub = sinon.stub(dep, 'ajax'); // never invokes callbacks
      const logWarnStub = sinon.stub(utils, 'logWarn');
      try {
        const request = runGetBidRequestData(
          reqBidsConfigObj,
          { params: { endpoint: 'https://example.com/rtd', timeout: 'invalid' } },
          0
        );

        expect(logWarnStub.calledOnceWithExactly(
          'ozoneRtd: Invalid params.timeout value "invalid"; overriding it with the 250ms default.'
        )).to.equal(true);
        await clock.tickAsync(250);
        await request;
      } finally {
        logWarnStub.restore();
        clock.restore();
      }
    });
  });
});
