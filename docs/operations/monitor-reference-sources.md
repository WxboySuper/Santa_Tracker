# Monitor reference-layer source research

Research captured 2026-08-09. Re-check provider capabilities and terms before
enabling a source in a hosted target; these services are operational and can
change independently of GFC.

This document and its fixtures establish the source contract only. HOT-04 owns
the opt-in adapters and Monitor controls; no source described here is enabled
by this research change.

## Recommended sources

| Product | Official source | Shape/use | Refresh and validity | Attribution/operations |
| --- | --- | --- | --- | --- |
| NWS point/grid forecast | [`/points/{lat},{lon}`](https://api.weather.gov/points/39.7456,-97.0892), then the discovered `forecast`, `forecastHourly`, or `forecastGridData` link | JSON-LD/GeoJSON point metadata plus linked forecast periods; use for a selected point or forecast metadata, not a fabricated polygon | The point response supplies the current WFO/grid mapping and cache headers; periodically re-check `/points` because the mapping can change | NOAA/NWS open data. Send an identifying `User-Agent` with contact information and respect provider rate limits |
| NDFD temperature forecast | [NDFD temperature MapServer](https://mapservices.weather.noaa.gov/raster/rest/services/NDFD/NDFD_temp/MapServer) and its [OGC WMS capabilities](https://mapservices.weather.noaa.gov/raster/services/NDFD/NDFD_temp/MapServer/WMSServer?request=GetCapabilities&service=WMS) | Time-enabled WMS raster for current and forecast temperature products; use as the map reference layer | Provider documents updates at 20 and 50 minutes past the hour. Discover valid times from capabilities/Identify or the service return-updates operation; do not hard-code a timestamp | NOAA/NWS/DISS GIS service. Keep the service attribution visible in Monitor and any image export |
| SPC Mesoscale Discussions | [SPC ArcGIS layer](https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/spc_mesoscale_discussion/MapServer/0), [SPC MD RSS](https://www.spc.noaa.gov/products/spcmdrss.xml), and [ActiveMD.kmz](https://www.spc.noaa.gov/products/md/ActiveMD.kmz) | GeoJSON polygon layer with area, affected/concerning lines, valid time, summary, technical discussion, and product link; RSS is the lightweight issuance index | The ArcGIS service documents updates within 15 minutes of an MD/MCD issuance and is not time-enabled; treat the current response as a replaceable snapshot | NOAA/NWS/SPC. Keep product number, source link, and valid time visible; never interpret an MD as a GFC warning or forecast edit |

The NWS API is the official point/grid forecast source, but it does not itself
provide a national forecast polygon layer. NDFD WMS is therefore the map
oriented short-term forecast source for HOT-04, while the NWS API remains the
source for point metadata and future point-detail affordances.

## Access and caching recommendation

The current Monitor already consumes NOAA services directly from the browser,
so the first implementation should use typed client adapters rather than add a
new server proxy. Each adapter must:

1. send the NWS identifying `User-Agent` when using `api.weather.gov`;
2. honor provider cache headers where available and apply a bounded client
   cache so refresh/playback cannot create request loops;
3. keep the last valid normalized snapshot for a short, visible stale window;
4. expose `loading`, `empty`, `stale`, and `error` states separately; and
5. retain `sourceUrl`, `sourceName`, `attribution`, `issuedAt`, `validFrom`,
   and `validTo` in the normalized record.

If a provider blocks browser access or a future national cache is needed, move
only the normalization/cache boundary behind the existing server. Do not make
the forecast package, editable forecast state, or image export depend on a
successful live reference-layer request.

## Normalized contract for HOT-04

The adapter layer should normalize provider-specific responses into a common
reference record:

The checked-in fixtures are contract examples rather than a provider archive;
adapter tests should validate normalization without requiring live upstream
availability.

```ts
interface MonitorReferenceRecord<T> {
  id: string;
  kind: 'ndfd-temperature' | 'spc-mesoscale-discussion';
  sourceName: string;
  sourceUrl: string;
  attribution: string;
  issuedAt?: string;
  validFrom?: string;
  validTo?: string;
  data: T;
}
```

NDFD records keep the WMS configuration and selected valid time. SPC records
keep the normalized GeoJSON feature collection and product metadata. Neither
record is copied into a forecast cycle unless a later, explicit export feature
requests it.

## Failure and fallback behavior

| Provider state | Monitor behavior | Sentry behavior |
| --- | --- | --- |
| Loading | Keep the map usable and show a bounded loading label in the source control | No exception |
| Valid snapshot | Render the independent layer and its source/valid-time metadata | No event |
| Empty response | Hide the layer and explain that no product is currently available | No exception |
| Stale snapshot | Keep the last snapshot only inside the short stale window and label it stale | Optional low-volume diagnostic, not an exception |
| Timeout, malformed, or provider error | Hide only that layer, keep the rest of Monitor working, and offer Refresh | Filter expected upstream failures from error reporting |

## Compact fixtures

Small representative fixtures are checked in for parser tests:

- [`nws-point-forecast.json`](../../src/monitor/fixtures/nws-point-forecast.json)
  captures the linked `/points` shape without a live forecast payload.
- [`nws-forecast.json`](../../src/monitor/fixtures/nws-forecast.json) captures
  the period fields the normalizer needs.
- [`spc-mesoscale-discussion.geojson`](../../src/monitor/fixtures/spc-mesoscale-discussion.geojson)
  captures one polygon and the metadata needed for a map popup.

These are deliberately small, synthetic-at-capture-shape fixtures rather than
an archive of provider data. The live URLs and access date above are the
research record; tests must not depend on a provider being available.
When an adapter later discovers provider-contract drift, update this record
before changing the normalized runtime assumptions.

