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
| Map lifecycle, interactions, and React state | `src/components/Map/OpenLayersForecastMap.tsx` | `ForecastMap.tsx` |

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
- Layer helpers: `applyBlankLayerStyle`, `replaceLayerGroupLayers`,
  `ensureBlankLayerLoaded`
- Style builders: `toOlStyle`, `createCustomFill`, `toCustomOlStyle`,
  `toTstmPreviewOlStyle`, `toGhostOlStyle`
- Custom-product helpers: `getCustomFeatureIdentity`, `toUpdatedCustomFeature`,
  `toDrawnCustomFeature`
- Map sources: `createLabelOverlaySource`, `createTileSource`
- Overlay helper: `hideOverlay`

The React component keeps `removeDrawInteraction` (map lifecycle), the
blank-basemap GeoJSON caches, and the blank layer styles.

## Verification

- `src/components/Map/openLayersMapStyles.test.ts` provides focused unit tests
  for the new boundary (11 tests).
- The existing `OpenLayersForecastMap.test.ts` and
  `OpenLayersForecastMap.extra.test.ts` still cover the component's lifecycle
  helpers and the re-imported styling behavior.
- Full build, typecheck, and lint pass.

## Follow-up slices

Ordered by risk reduction:

1. Extract `useOutlookLayersState`-style Redux coupling out of the map
   component's effect bodies into a dedicated hook module.
2. Split the blank-basemap loader/cache out of `OpenLayersForecastMap.tsx`.
3. Extract `ForecastPage.tsx` save/session state helpers into a page-level
   controller module.
