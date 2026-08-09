# NOAA Damage Assessment Toolkit data

GFC's DAT adapter lives in `src/utils/dat/`. It reads the public NOAA/NWS
ArcGIS FeatureServer directly from the browser. The service currently allows
the GFC production origin through CORS, so this prototype does not add a
backend proxy.

## Endpoints

The service root is:

`https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer`

## GFC placement

The verification engine is a pure utility layer under `src/utils/verificationV2/`,
while the repository does not use a shared `src/services` data-provider layer
for this workflow. The adapter therefore lives under `src/utils/dat/`, with
`src/utils/verificationV2/sources.ts` providing the optional source boundary to
the Forecast Grade hook. React and OpenLayers receive normalized DAT types,
not ArcGIS response objects.

The adapter uses these layers:

- Layer 0: damage points and survey indicators
- Layer 1: damage tracks / tornado paths
- Layer 2: damage polygons / surveyed damage areas

Queries request `f=geojson`, `returnGeometry=true`, and `outSR=4326`. Date
filters use ArcGIS epoch-millisecond `time=start,end` values. Viewport filters
use an `esriGeometryEnvelope` in EPSG:4326. Pages are fetched until the
service stops returning `exceededTransferLimit`; the client bounds each page
at NOAA's advertised 2,000 records.

## Association strategy

The live layer metadata defines the reliable relationship:

`Layer 1.globalid -> Layer 0.path_guid` and
`Layer 1.globalid -> Layer 2.path_guid`.

The adapter follows that relationship with child-layer `where` queries. It
does not join on `event_id`: the field can be blank and is a display/event
label rather than a unique tornado-path identifier. Some older records also
have the all-zero `path_guid`, so a track may legitimately have no associated
children. Current events can go further and publish valid damage points with a
null `path_guid`; the date-range evidence loader therefore queries layers 0 and
2 directly by time as the viewer does, then merges any relationship results by
object ID.

## Verification prototype behavior

Forecast Grade keeps SPC reports as the event-occurrence and event-yield
source. When DAT is available, EF-coded damage points (`EF0`–`EF5` and `EFU`)
are supplemental tornado evidence for the significant-threat component. DAT
wind/TSTM records are not counted as tornado evidence. DAT tracks, polygons,
and points are displayed as a separate survey layer and summarized in the
results pane. This prevents dense survey points from being mistaken for
independent SPC storm reports while still allowing surveyed EF2+ damage to
change tornado scoring.

The service describes its data as quality controlled but preliminary. GFC
keeps that status visible and treats a DAT outage as optional: SPC grading can
still complete, with the DAT error shown in the results pane.

## Attachments

Layer 0 advertises attachments. `DatClient.queryDamagePointAttachments`
returns normalized metadata and `getDatAttachmentUrl` builds the documented
feature attachment URL:

`.../FeatureServer/0/{objectId}/attachments/{attachmentId}`

The endpoint was verified against a live surveyed point: NOAA returned JPEG
attachment metadata and a successful HTTP response for the attachment URL.
The current UI does not eagerly download photos; the adapter is ready for a
later point-detail experience.

## Example

```ts
import { datClient } from '../src/utils/dat';

const tracks = await datClient.queryTracks({
  timeRange: { start: '2017-01-22T00:00:00Z', end: '2017-01-23T00:00:00Z' },
  bounds: { minLon: -85, minLat: 30, maxLon: -82, maxLat: 35 },
});

const surveyedPoints = tracks[0]
  ? await datClient.queryDamagePointsForTrack(tracks[0])
  : [];
```

## Known limitations

- DAT survey publication can lag the storm date and may be absent for a
  current event.
- The service does not document units for normalized `length` and `width`
  fields; GFC preserves the source values without relabeling or converting
  them.
- Some legacy track, point, and polygon records have null dates, blank event
  labels, or all-zero association keys.
- The prototype loads related children for every date-matched track. A future
  map-only workflow should add viewport-scoped child loading and a persistent
  cache before supporting repeated pan/zoom exploration.

## Live research references

- [NOAA DAT FeatureServer metadata](https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer?f=pjson)
- [NOAA DAT damage-point metadata](https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer/0?f=pjson)
- [ArcGIS Feature Service query reference](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/)
- [ArcGIS attachment query reference](https://developers.arcgis.com/rest/services-reference/enterprise/query-attachments-feature-service-layer/)
