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

Non-floor data is placed at `ortb2.site.ext.ozoneRtd` (forwarded to the Ozone
endpoint). The `floors` and `floorsByBidder` blocks are applied as price floors
(see below) and are **not** copied into `site.ext.ozoneRtd`:

```json
{
  "floors": {
    "mpu":         { "declaredFloor": 0.45, "currency": "USD" },
    "leaderboard": { "declaredFloor": 0.45, "currency": "USD" }
  },
  "floorsByBidder": {
    "mpu": {
      "appnexus": { "declaredFloor": 0.60, "currency": "USD" },
      "rubicon":  { "declaredFloor": 0.30, "currency": "USD" }
    }
  }
}
```

# Price floors

The provider applies floors by **wrapping each bid's `getFloor()`**. For every bid
it picks the per-bidder floor if present, else the generic ad-unit floor, and wraps
that bid's `getFloor()` to return `max(ourFloor, publisherFloor)`:

- **`floors`** (per ad unit) → generic floor, the fallback for any bidder without a
  specific one.
- **`floorsByBidder`** (per ad unit, then per **Prebid bidder code**) → per-bidder
  override; each bidder gets its own floor.

`adapterManager.getBids()` copies the wrapped `getFloor()` onto each bidder's bid
request, so the floor reaches **every** adapter (Ozone, AppNexus, etc.) on the
current auction — no per-adapter code.

> **Why a wrapper, not `ortb2Imp.ext.prebid.floors.floorMin`?** The floors module
> caches `getFloor()` results on shared per-auction data keyed only by its schema
> fields (never the bidder), so a per-bid `floorMin` set on the first bid is cached
> and returned for every other bid — all bidders/ad units end up with the same
> floor. Wrapping `getFloor()` per bid bypasses that cache.

Two consequences to be aware of:

- **The Price Floors module must be enabled** for the auction (even a minimal base
  config). `getFloor()` returns `{}` for a skipped/absent auction, so `floorMin`
  is never read otherwise:
  ```js
  pbjs.setConfig({ floors: { data: { schema: { fields: ['mediaType'] }, values: { '*': 0.01 } } } });
  ```
- **`floorMin` raises the floor (`Math.max`)** — it will not lower a higher
  publisher rule.

The provider deliberately does **not** push floor data via
`config.setConfig({floors:{data}})` / `createFloorsDataForAuction` / the internal
`_floorDataForAuction` map: that map is a test-only export, and the floors module
computes each auction's data before this RTD hook runs, so those paths either
couple to Prebid internals or land on the next auction rather than the current
one. See the block comment on `applyFloorsToAdUnits` in `ozoneRtdProvider.js`.

# Gotchas

- **Include the `priceFloors` module and set a base config before the first
  `requestBids`** (see above). No floors module ⇒ no floors, for any adapter.
- **Ad units must declare `mediaTypes`** (not legacy top-level `sizes`). Ozone's
  floor path (`obj.floor` / `imp.bidfloor`) only runs for ad units with a
  `mediaTypes` object; a `sizes`-only ad unit is not floored by Ozone.
- **Set `auctionDelay` and `waitForIt: true`** or the auction won't wait for the
  API. `waitForIt` goes on the dataProvider entry, not in `params`. The provider
  caps its timeout slightly below `auctionDelay`, so late responses cannot mutate
  auction data after the bid requests have started being built.
- **Neither `floors` nor `floorsByBidder` is duplicated into `site.ext.ozoneRtd`**
  — both flow only via `getFloor()` (per-imp / per-bid `floorMin`). Only non-floor
  data is forwarded to the Ozone endpoint there.
- **`floorsByBidder` keys are top-level Prebid bidder codes** (appnexus, rubicon,
  ozone…). Because Ozone is a single Prebid bidder, this gives Ozone **one** floor
  (the `ozone` entry) — it cannot set floors for individual seats/SSPs inside the
  Ozone server. (The floors module has no native `bidder` rule dimension; its
  `additionalSchemaFields` bidder dimension lives in `floors.data`, read before
  this hook, so it suits statically configured floors only.)
- **Currency is sent verbatim** (default USD); conversion is left to the
  floors/currency modules at `getFloor()` time.
