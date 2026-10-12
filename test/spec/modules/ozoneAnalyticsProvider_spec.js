import { expect } from 'chai';
import { mapObject } from 'modules/ozoneAnalyticsAdapter.js';
import { EVENTS } from 'src/constants.js';

describe('Ozone Analytics Adapter', function() {
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
});
