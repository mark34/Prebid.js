# Overview

```
Module Name: Ozone RTD Provider
Module Type: RTD Provider
Maturity: Development
```

# Description

Fetches additional data from a configurable API endpoint before the auction is
sent, and writes it into the ortb2 first-party-data fragments so the Ozone bid
adapter can use it.

The Ozone bid adapter only forwards ortb2 paths that sit under an `ext` key
within 2 levels of nesting. This provider therefore writes the server's flat
response object wholesale to `ortb2.site.ext.ozoneRtd` (or `ortb2.user.ext.ozoneRtd`
when `params.target` is `user`).

The API call is bounded by `params.timeout`; if it exceeds that, the auction
proceeds without the data so the auction is never blocked.

# Configuration

```js
pbjs.setConfig({
  realTimeData: {
    auctionDelay: 300,            // ms Prebid will wait for RTD providers
    dataProviders: [{
      name: 'ozoneRtd',
      waitForIt: true,
      params: {
        endpoint: 'https://your.api/endpoint',
        timeout: 250,             // ms; default 1000
        target: 'site',           // 'site' (default) or 'user'
        method: 'GET',            // default 'GET'
        withCredentials: false,   // default false
        // requestBody: '{...}',  // optional, for POST
      }
    }]
  }
});
```

# Expected API response

A simple flat object of key/value pairs:

```json
{ "key1": "val1", "key2": "val2" }
```

This object is placed verbatim at `ortb2.site.ext.ozoneRtd`.
