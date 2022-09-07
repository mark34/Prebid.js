
# Overview

```
Module Name: Newspass Bidder Adapter
Module Type: Bidder Adapter
Maintainer: newspass@ardm.io

```

# Description

Module that connects to the Newspass demand source(s).

The Newspass bid adapter supports Banner and Outstream Video mediaTypes ONLY.
This is intended for USA audiences only, and does not support GDPR

# Test Parameters


A test ad unit that will consistently return test creatives:

```

//Banner adUnit

adUnits = [{
                    code: 'id-of-your-banner-div',
			        mediaTypes: {
			          banner: {
			            sizes: [[300, 250], [300,600]]
			          }
			        },
                    bids: [{
                        bidder: 'newspass',
                        params: {
                            publisherId: 'NEWSPASS123', /* an ID to identify the publisher account  - required */
                            siteId: '4204204201', /* An ID used to identify a site within a publisher account - required */
                            placementId: '0420420421', /* an ID used to identify the piece of inventory - required - for appnexus test use 13144370. */
							customData: [{"settings": {}, "targeting": {"key": "value", "key2": ["value1", "value2"]}}],/* optional array with 'targeting' placeholder for passing publisher specific key-values for targeting. */                            
                        }
                    }]
                }];
```

