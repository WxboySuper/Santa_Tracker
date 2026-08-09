# Forecast map styling seam

Issue: [#716](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/716)

The OpenLayers forecast map was a large mixed-responsibility module. This
document records the first extraction along a stable domain seam: **map styling
and feature conversion**.

## Ownership and dependency direction

| Concern | Owner | Consumers |
| --- | --- | --- |
| Color, hatch, and OL style construction | `src/components/Map/openLayersMapStyles.ts` | `OpenLayersForecastMap.tsx`, `src/monitor/components/monitorMapFeatureSync.ts` |
| Feature identity and GeoJSON round-tripping | `src/components/Map/openLayersMapStyles.ts` | `OpenLayersForecastMap.tsx` |
| Base-map tile/label source selection | `src/components/Map/openLayersMapStyles.ts` | `OpenLayersForecastMap.tsx` |
| Overlay hide helper | `src/components/Map/openLayersMapStyles.ts` | `src/monitor/components/useMonitorOlMap.ts`, `src/monitor/components/useMonitorMapBootstrap.ts` |
| Blank-basemap boundary fetch/cache and styles | `src/components/Map/openLayersBlankBasemap.ts` | `OpenLayersForecastMap.tsx` |
| Redux selectors and render serialization | `src/components/Map/useForecastMapReduxState.ts` | `OpenLayersForecastMap.tsx` |
| Map lifecycle, interactions, and React state | `src/components/Map/OpenLayersForecastMap.tsx` | `ForecastMap.tsx` |
| Forecast save/load, restore, and day-rollover session actions | `src/pages/forecastPageController.ts` | `ForecastPage.tsx` |

Dependency direction is strictly one-way: `OpenLayersForecastMap.tsx` imports
from `openLayersMapStyles.ts`; the styling module imports only OL primitives,
`mapStyleUtils`, and shared type definitions. No consumer imports back into the
component, so there are no circular dependencies.

## What moved

The pure styling/geometry/feature helpers were extracted verbatim (no behavior
change) from `OpenLayersForecastMap.tsx` into `openLayersMapStyles.ts`:

- Color/hatch: `toRgbaColor`, `createHatchPattern`, `resolveFillOpacity`,
  `createOutlookFill`, `resolveStrokeWidth`
- Outlook feature helpers: `getFeatureIdentity`, `toUpdatedGeoJsonFeature`,
  `isDrawableOutlookType`
- Layer helpers: `replaceLayerGroupLayers`; blank-basemap loading helpers are
  now owned by `openLayersBlankBasemap.ts` and re-exported for compatibility.
- Style builders: `toOlStyle`, `createCustomFill`, `toCustomOlStyle`,
  `toTstmPreviewOlStyle`, `toGhostOlStyle`
- Custom-product helpers: `getCustomFeatureIdentity`, `toUpdatedCustomFeature`,
  `toDrawnCustomFeature`
- Map sources: `createLabelOverlaySource`, `createTileSource`
- Overlay helper: `hideOverlay`

The React component keeps `removeDrawInteraction` (map lifecycle), map DOM and
interaction refs, and OpenLayers layer orchestration. Blank-basemap loading,
cache ownership, and styles now live in `openLayersBlankBasemap.ts`; Redux
selection and feature serialization live in `useForecastMapReduxState.ts`.

ForecastPage now delegates save/load, browser-session restore, unsaved-change
warnings, and day-rollover actions to `forecastPageController.ts`. The page
retains layout composition and keyboard/cloud toolbar wiring.

## Verification

- `src/components/Map/openLayersMapStyles.test.ts` provides focused unit tests
  for styling and feature conversion.
- The existing `OpenLayersForecastMap.test.ts` and
  `OpenLayersForecastMap.extra.test.ts` still cover the component's lifecycle
  helpers and the compatibility re-export for blank-layer loading.
- `openLayersBlankBasemap.ts` owns the blank-layer loading contract and cache;
  its public loader behavior remains covered by the existing focused tests.
- Typecheck and targeted lint pass after the completed extraction.

## Completed slices

1. Extract Redux coupling and feature serialization into
   `useForecastMapReduxState.ts`.
2. Split blank-basemap loading, caching, and styles into
   `openLayersBlankBasemap.ts`.
3. Extract ForecastPage save/session helpers into
   `forecastPageController.ts`.
