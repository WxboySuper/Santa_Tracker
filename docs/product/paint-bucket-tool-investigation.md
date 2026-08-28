# Paint Bucket Outlook Tool — Investigation (#623)

Research and prototype notes for a paint-bucket style interaction that lets forecasters upgrade or downgrade outlook areas without redrawing polygons.

## Problem

Today, changing the risk level on an existing polygon requires either:

1. Redrawing the polygon under a new active probability, or
2. Manually editing vertices while the active probability is changed.

Arrow keys only change the **next drawn** polygon's probability (`drawingState.activeProbability`), not polygons already on the map.

## Feasibility with the current OpenLayers model

**Verdict: feasible for click-to-recategorize; partially feasible for true region fill.**

GFC stores outlook geometry as independent GeoJSON `Feature` polygons grouped in `Map<probabilityKey, Feature[]>` per outlook type (`forecastSlice`). OpenLayers renders only the **active outlook type** on the editable layer (`useForecastMapReduxState`).

| Capability | Feasibility | Notes |
|------------|-------------|-------|
| Click hit polygon → change probability | **High** | Reuses `forEachFeatureAtPixel` / `Select` patterns from pan/delete modes |
| Click empty space → fill bounded region | **Low–Medium** | No planar graph or raster mask exists; needs new geometry engine |
| Promote/demote by one step | **High** | Same as recategorize with computed target from `getProbabilityList` |
| Subtract overlaps when upgrading | **Medium** | Turf `difference` works but is slow/fragile on complex overlaps |
| CIG hatch editing via bucket | **Medium** | CIG lives in parallel `CIG1`/`CIG2`/`CIG3` keys; bucket can target them like any key |
| Auto-categorical side effects | **Handled** | Probabilistic edits trigger `useAutoCategorical`; undo snapshots include categorical at undo time |
| Undo/redo | **High** | Single `pushUndoSnapshot` per bucket action via `setOutlookMap` or dedicated reducer |
| Holes / MultiPolygon | **Medium** | Supported in storage; Turf ops may produce multipolygons |
| Nested risks (SPC-style rings) | **Ambiguous** | Storage is flat per-key feature lists, not a unified partition |

## Interaction options

### Option A — Recategorize to active (recommended first slice)

**Behavior:** In Fill mode, click a polygon → move it to `drawingState.activeProbability`.

**Pros:** Minimal ambiguity, mirrors "pick color then click", one undo step, no Turf required.

**Cons:** Does not fill empty space; user must select target probability first (arrow keys / outlook panel).

### Option B — Step up / step down

**Behavior:** Click promotes hit polygon one probability step; Shift+click demotes.

**Pros:** Fast keyboard-free upgrades without changing the active brush.

**Cons:** Less discoverable; separate from "active probability" mental model.

### Option C — Subtract overlaps on assign

**Behavior:** Like Option A, but before placing geometry at the target key, subtract it from all other features in the same outlook type (Turf `difference`).

**Pros:** Closer to "paint over" semantics when risks nest; avoids double-painting the same area at two levels.

**Cons:** Turf topology failures, performance on large forecasts, unpredictable slivers; CIG layers need separate rules.

### Option D — True flood fill (deferred)

**Behavior:** Click inside a region bounded by polygon edges / coastlines → create polygon for that face.

**Pros:** Classic paint-bucket UX for unfilled areas.

**Cons:** Requires building a planar subdivision from all edges + map boundaries; high engineering cost; ambiguous at coastlines and overlapping same-level polygons.

## Geometry risks

| Scenario | Risk | Mitigation in prototypes |
|----------|------|--------------------------|
| Overlapping same probability | Multiple features at one key | Recategorize only changes clicked feature |
| Overlapping different probabilities | Visual stacking via z-index | Option C subtracts from lower/other keys |
| Nested cumulative categorical | Auto-derived, read-only | Block auto-generated categorical (same as delete) |
| CIG spanning risk boundaries | Hatch is a blanket overlay | Treat CIG keys independently; document that bucket does not auto-sync hatch |
| Undo after auto-categorical | Categorical may differ until next derivation | Undo restores full day snapshot including categorical |
| Disjoint multipolygon result after subtract | Turf difference output | Drop null/empty results; keep original on failure |

## Recommended rollout

1. **Prototype (this branch):** Step + Assign modes behind `paintBucketTool` (local and beta only).
2. **Beta candidate:** Ship both modes after user testing.
3. **Defer:** True region flood-fill and combined prob+CIG bucket actions until product rules are defined.

## Test plan

Unit tests (`src/utils/paintBucket/paintBucket.test.ts`):

- Recategorize moves feature between map keys and updates properties
- Step up/down respects probability list boundaries
- Subtract removes overlap from other keys without deleting the moved feature
- No-op when target equals source
- Undo/redo restores prior map (`forecastSlice` integration test)

Manual QA:

- Draw 10% and 15% overlapping tornado polygons → bucket upgrade 10% region to 15%
- Undo/redo restores geometry and keys
- Auto-generated categorical remains read-only in fill mode
- CIG layer: draw CIG2 hatch, bucket to CIG3

Prototype deferrals tracked in [#1079](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/1079):

- [ ] Verify nested same-pixel polygons through the full map click and move flow.
- [ ] Add CIG blanket and clipping rules before enabling overlap subtraction.
- [ ] Add Turf difference failure-path coverage when Option C is implemented.
- [x] Preserve holes and MultiPolygon geometry when moving an existing feature.

## Prototype UX (local builds)

One **Edit** toolbar button keeps the map chrome minimal. When Edit is active, a compact **Step | Set** toggle appears inline:

| Sub-mode | Purpose |
|----------|---------|
| **Step** | Click to raise risk one level; Shift+click to lower. Core upgrade/downgrade workflow. |
| **Set** | Click to apply the **active** probability from the outlook panel / arrow keys. |

Both sub-modes are limited to **probabilistic outlook layers** (tornado, wind, hail, totalSevere, day4-8). Categorical outlooks disable Edit.

Overlapping polygons: hit-testing selects the **highest-risk** feature at the click pixel.

This is not a flood-fill tool — it only changes polygons that are already drawn.

## Prototype files

| File | Role |
|------|------|
| `src/utils/paintBucket/` | Pure strategy functions |
| `src/store/forecastSlice.ts` | `applyPaintBucketEdit` reducer |
| `src/config/featureExposure.ts` | `paintBucketTool` flag |
| `src/components/Map/OpenLayersForecastMap.tsx` | `fill` interaction mode |
| `src/components/Map/openLayersFeatureSync.test.ts` | Regression test for probability-bucket moves |

## Bug found during prototype (fixed)

Initial manual testing showed polygons **disappearing** after fill while Redux + undo worked correctly.

**Root cause:** OpenLayers feature-sync descriptor keys included probability (`normal:tornado:2%:uuid`). When fill moved a feature to a new bucket, reconcile updated the OL feature in place with a new render key, but `removeStaleFeatures` still indexed it under the old probability key and removed it as stale.

**Fix:** Use stable descriptor keys without probability (`normal:tornado:uuid`). Probability/style changes flow through the existing `signature` + `apply()` update path.

## Open questions for product

1. Should bucket work on **categorical** (manual TSTM only) or probabilistic layers only?
2. When upgrading, should lower-probability geometry be **clipped automatically** (Option C) or **left overlapping** (Option A)?
3. Should Shift+click always demote, or should demote be a separate toolbar toggle?
4. Is filling **empty** land (no polygon under cursor) in scope for v1?
