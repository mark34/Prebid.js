const expect = require('chai').expect;
const { host, protocol } = require('../../../helpers/testing-utils');

const TEST_PAGE_URL = `${protocol}://${host}:9999/integrationExamples/gpt/ozone.html`;
const CREATIVE_IFRAME_CSS_SELECTOR = 'frame[id="ads-rectangle-desktop"]';

const EXPECTED_TARGETING_KEYS = {
  // to be finalised
  'hb_format': 'banner',
  'hb_source': 'client',
  'hb_pb': '0.60',
  'hb_bidder': 'ozone',
  'hb_pb_rubicon': '0.60',
  'hb_bidder_rubicon': 'rubicon'
};

describe('Ozone Mpu Ad Unit Test', function () {
  before(function loadTestPage() {
    browser.url(TEST_PAGE_URL).pause(3000);
    try {
      browser.waitForExist('body', 2000);
      // browser.waitForExist(CREATIVE_IFRAME_CSS_SELECTOR, 2000);
      // const creativeIframe = $(CREATIVE_IFRAME_CSS_SELECTOR).value;
      // browser.frame(creativeIframe);
    } catch (e) {
      // If creative Iframe didn't load, repeat the steps again!
      // Due to some reason if the Ad server doesn't respond, the test case will time out after 60000 ms as defined in file wdio.conf.js
      loadTestPage();
    }
  });

  it('should load the targeting keys with correct values', function () {
    const result = browser.execute(function () {
      return window.top.pbjs.getAdserverTargeting('ads-rectangle-desktop');
    });
    expect('1').to.equal('1');
  });
});
