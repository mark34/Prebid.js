import { expect } from 'chai';
import sinon from 'sinon';
import { mapObject } from 'modules/ozoneAnalyticsAdapter.js';
import { EVENTS } from 'src/constants.js';
import { auctionManager } from 'src/auctionManager.js';

describe('Ozone Analytics Adapter', function() {
  let sandbox;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
  });

  afterEach(function() {
    sandbox.restore();
  });

  it('adds configured test-group fields to an analytics payload', function() {
    const configOptions = {
      testgroupKeyName: 'experiment',
      testgroupVal: 'variant-a'
    };

    expect(mapObject(EVENTS.AUCTION_INIT, {}, configOptions)).to.include({
      testgroupKey: 'experiment',
      testgroupVal: 'variant-a'
    });
  });

  it('does not add null test-group fields to an analytics payload', function() {
    const configOptions = {
      testgroupKeyName: null,
      testgroupVal: null
    };

    const payload = mapObject(EVENTS.AUCTION_INIT, {}, configOptions);

    expect(payload).not.to.have.property('testgroupKey');
    expect(payload).not.to.have.property('testgroupVal');
  });

  it('preserves falsey non-null test-group values', function() {
    const configOptions = {
      testgroupKeyName: '',
      testgroupVal: "0"
    };

    expect(mapObject(EVENTS.AUCTION_INIT, {}, configOptions)).to.include({
      testgroupKey: '',
      testgroupVal: "0"
    });
  });

  it('does not report response floor data when the bid request ignores floors', function() {
    sandbox.stub(auctionManager.index, 'getBidRequest').returns({ ignoreFloors: true });

    const payload = mapObject(EVENTS.BID_RESPONSE, {
      requestId: 'bid-request-id',
      floorData: {
        floorValue: 0.01,
        floorCurrency: 'USD'
      }
    }, {
      testgroupKeyName: null,
      testgroupVal: null
    });

    expect(payload).to.include({
      floor_value: '',
      floor_currency: ''
    });
  });

  it('continues to report response floor data without an RTD ignore marker', function() {
    sandbox.stub(auctionManager.index, 'getBidRequest').returns({});

    const payload = mapObject(EVENTS.BID_RESPONSE, {
      requestId: 'bid-request-id',
      floorData: {
        floorValue: 0.42,
        floorCurrency: 'GBP'
      }
    }, {
      testgroupKeyName: null,
      testgroupVal: null
    });

    expect(payload).to.include({
      floor_value: '0.42',
      floor_currency: 'GBP'
    });
  });

  it('reports indexed RTD floor data instead of the default response floor', function() {
    sandbox.stub(auctionManager.index, 'getBidRequest').returns({
      ozoneRtdFloorData: {
        floorValue: 0.40,
        floorCurrency: 'USD',
        matchedFields: { mediaType: 'banner' }
      }
    });

    const payload = mapObject(EVENTS.BID_RESPONSE, {
      requestId: 'bid-request-id',
      floorData: {
        floorValue: 0.01,
        floorCurrency: 'USD'
      }
    }, {
      testgroupKeyName: null,
      testgroupVal: null
    });

    expect(payload).to.include({
      floor_value: '0.4',
      floor_currency: 'USD',
      floor_matched_media_type: 'banner'
    });
  });
});
