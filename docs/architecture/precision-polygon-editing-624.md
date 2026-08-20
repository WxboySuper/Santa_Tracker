# Precision polygon editing (#624)

Integrated polygon vertex editing for forecast mode.

## Behavior

Vertex editing uses the existing Pan mode and outlook-panel tier selection — no separate precision-edit UI.

| Action | How |
|--------|-----|
| Reshape polygon | Pan mode → drag vertex handles on the **selected** probability, CIG, or custom category |
| Remove vertex | Alt or Shift + click a vertex handle |
| Delete whole polygon | Delete mode → click polygon |
| Independent CIG vs probability | Select the tier in the outlook panel (or custom category) before editing; `Modify` filters to that tier |

## Implementation

- `OpenLayersForecastMap.tsx` — `Modify` filter matches `drawingState.activeProbability` or active custom category; vertex `deleteCondition`; one-line Pan help on map toolbar
- `precisionPolygonEditHandler.ts` — `modifyend` dispatches `updateFeaturesBatch` for one undo step per gesture
- `forecastSlice.ts` — `updateFeaturesBatch` reducer

## Notes

- Auto-generated categorical polygons remain read-only on the categorical layer.
- Coincident vertices across tiers no longer co-move when only one tier is selected.
