# ADR 0004: Map delivery for Christmas Eve 2026

**Status:** Proposed (owner approval required)
**Date:** 2026-11-23

## Context

The tracker currently loads the OpenFreeMap Liberty style and falls back to OpenStreetMap raster tiles in [openlayers-tracker-map.ts](../../apps/web/src/lib/openlayers-tracker-map.ts). The tracker must remain useful when either tile source is unavailable. Route state is independent of the map, as required by [ADR 0002](0002-cloudflare-workers-hosting.md) and the [2026 reinvention plan](../planning/christmas-2026-reinvention.md).

Christmas Eve traffic is a short, concentrated burst. The repo has no measured request forecast, provider quota, or load-test result for the selected basemap. The comparisons below therefore describe operating characteristics, not a guaranteed bill or capacity estimate.

## Options

| Option | Cost and peak load | Attribution and licence | Caching and outage behavior |
| --- | --- | --- | --- |
| Hosted vector tiles, current OpenFreeMap style | Its terms call the service free and "as-is," with no warranties. That is not a capacity commitment. The provider carries tile generation and delivery load. | Keep visible OpenStreetMap attribution and any style/provider credits required by the style. OSM data is ODbL. Recheck the terms before launch. | Browser and CDN caches reduce repeat requests. The current OSM raster fallback is a second external service, not an SLA-backed failover. OSM's standard tile service is best effort and asks clients to honor cache headers, avoid bulk downloads, and show attribution. |
| PMTiles hosted on project R2 | One-time regional extract/build work. R2 currently lists a 10 GB-month free storage allowance, 1 million free Class A operations, 10 million free Class B operations, and no egress charge. Reads beyond the allowance can still cost money. A PMTiles archive lets the browser fetch byte ranges; a cache-friendly archive can reduce repeated origin reads, but peak request behavior must be load-tested. | Same underlying OSM attribution and ODbL obligations. Preserve source attribution and any basemap style licence notices. The project owns update cadence and data provenance. | Immutable, versioned objects can be cached for a long time. A bad or unavailable R2 object can break the custom map, so keep the existing hosted style as fallback and a no-map presentation. R2's price is not a service-level guarantee. |
| Self-hosting tiles | Highest operational cost: tile generation, storage, bandwidth, monitoring, patching, and peak capacity. Existing VPS suitability has not been established. A single small server is a poor fit for the Christmas Eve burst without tested caching and capacity headroom. | OSM attribution and ODbL obligations remain. Keep any renderer and style licences in the release inventory. | Full control over cache policy and updates, but also sole responsibility for outages. Requires redundant hosting and tested restore/failover to be credible. |

Current references: [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/), [OpenFreeMap terms](https://openfreemap.org/tos/), [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/), and [OpenStreetMap licence guidance](https://www.openstreetmap.org/copyright).

## Decision

Recommend keeping OpenFreeMap as the default for the 2026 launch, behind the existing map adapter, with the existing OSM raster fallback and a text-first no-map mode. This is the lowest-effort path and avoids introducing a new dataset build and cache path during launch preparation. Do not describe the hosted service as guaranteed zero-cost or guaranteed to handle the peak.

Fallback plan:

1. If the vector style fails, try the existing OSM raster source.
2. If both fail, show route line and current/next stop in the no-map tracker. Position, ETA, progress, and facts continue to work.
3. If a launch rehearsal shows provider limits or poor availability, evaluate a bounded PMTiles-on-R2 prototype with a representative extract and load test. Do not switch providers without checking attribution, cache behavior, archive freshness, and the production cost estimate.

Cache immutable assets aggressively. Keep live route data on its existing short cache policy. Never prefetch large tile areas from OSM standard tiles; its published policy prohibits bulk download and asks users to honor cache headers.

## Consequences

- The map remains replaceable because the tracker owns the adapter and route state.
- The 2026 default relies on an external hosted style with no SLA established in this ADR.
- PMTiles may lower recurring provider dependence but shifts dataset maintenance and peak-read validation to the project.
- The no-map mode is a launch requirement, not a future enhancement.
