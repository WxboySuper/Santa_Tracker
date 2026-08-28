# Outlook polygon masking investigation (#619)

Research deliverable for optional border, coastline, and water masking for outlook
polygons. Product constraint from the issue: **masking must default off**; users
can forecast anywhere unless they opt in.

## Problem summary

Discord requests cluster around SPC-style behavior:

- Trim outlook fills so they do not extend over oceans or large water bodies.
- Respect coastlines and administrative boundaries when desired.
- Support workflows where contours should not cross water or should follow
  waterway/boundary lines.
- Avoid making masking mandatory or blocking off-domain drawing by default.

GFC already renders a **blank basemap** with vendored land/water context
(`worldCountries`, `lakes`, `usStates`) but outlook polygons are stored and
drawn as raw user geometry. Nothing clips them to land today.

## Current architecture (relevant pieces)

| Area | Location | Notes |
|------|----------|-------|
| Draw completion | `OpenLayersForecastMap.tsx` `drawend` | Writes GeoJSON to Redux via `addFeature` / `addCustomFeature` |
| Modify completion | Same map, `Modify` interactions | `updateFeature` on geometry edits |
| Stored geometry | `forecastSlice` | Outlook + custom layers; no mask metadata |
| Turf boolean ops | `autoCategoricalProcessing.ts` | Union/intersect/difference with error handling patterns to reuse |
| Vendored boundaries | `src/config/geoBoundarySources.ts`, `public/geodata/` | US states, world countries (110m), lakes (110m) |
| Blank basemap | `openLayersBlankBasemap.ts` | Visual land/water only; no clipping |
| Export | `useExportMap.ts` / `exportUtils.ts` | Rasterizes map + outlooks; geometry mutations flow through automatically |
| Overlay toggles | `overlaysSlice.ts`, `OverlayControls.tsx` | Pattern for opt-in map settings (state borders, counties) |

**Implication:** Any approach that **mutates stored geometry** automatically
benefits export, monitor, and verification. Render-only masking must be duplicated
in export and any other geometry consumers.

## Masking modes users may want (scoped separately)

Do not ship one mega-toggle. Treat these as distinct follow-ups:

1. **Coastline / ocean trim** — remove polygon area over ocean (SPC coastal shading).
2. **Great Lakes / inland water** — remove area over large lakes (separate from ocean).
3. **CONUS domain clip** — hard clip to SPC envelope (~24–50°N, 125–66°W).
4. **Administrative boundaries** — clip to US states or country exterior.
5. **Snap-to-boundary while drawing** — guide vertices; may not change stored geometry.
6. **Line-side fill** — fill only on one side of a polyline boundary (high complexity; defer).

Issue non-goals: mandatory masking, blocking off-domain drawing by default, official-outlook import/edit.

## When masking should run (options)

| Timing | UX | Persistence | Export / verification | Undo |
|--------|----|-------------|----------------------|------|
| **On draw/modify end** (auto, opt-in) | Feels like "smart draw" | Mutates Redux | Works automatically | Needs history entry |
| **On-demand action** ("Trim to coastline") | Explicit, reversible feel | Mutates on confirm | Works automatically | Single undo step |
| **Render-only** | Toggle preview | Original geometry kept | Must re-apply in export pipeline | N/A |
| **Export-only** | Hidden from editor | Original in editor | Clipped in JPEG/PNG only | N/A |

**Recommendation:** Ship **on-demand mutation first**, then optional **auto on
draw end** behind the same toggle. Defer render-only and export-only unless we
need a non-destructive preview before users commit.

## Recommended first implementation path

### Phase 1 — MVP (recommended first PR)

**Behavior**

- Add overlay setting: `trimOutlooksToLand: false` (default **off**).
- Add toolbar action: **Trim outlooks to land** (current day or all days — pick one for MVP).
- When enabled for auto mode OR when the action runs, clip each outlook polygon
  with `turf.intersect(outlook, landMask)` using a **cached land mask**.

**Land mask for MVP**

- Strategy: `us-country-minus-great-lakes` (prototype name in code).
- Build from **already vendored** datasets:
  - Land: US polygon from `ne_110m_admin_0_countries.geojson`
  - Subtract: Great Lakes features from `ne_110m_lakes.geojson` (name filter)
- Cache the computed mask in memory after first load (do not union 52 states per draw).

**Why this strategy first**

- Single country union is fast (~milliseconds) vs unioning 52 states (~1s in Node).
- Subtracting named Great Lakes matches SPC-style "no fill over lakes" better than
  raw state polygons (state shapes include lake interiors).
- Uses existing vendored assets and license trail in `geoBoundarySources.ts`.

**Integration points**

1. `overlaysSlice` — new boolean default `false`.
2. `OverlayControls` or Integrated Toolbar — toggle + optional "Trim now" button.
3. `src/utils/outlookPolygonMasking/` — land mask build + clip (prototype module in repo).
4. `OpenLayersForecastMap.tsx` `drawend` / modify handler — call clip when toggle on.
5. Batch trim action in `forecastSlice` — map all features for selected scope.

**Error handling**

- Mirror `autoCategoricalProcessing.ts`: if Turf fails, show toast, keep original
  geometry, log to Sentry (topology errors are realistic on hand-drawn polygons).

### Phase 2 — Quality + scope

- Vend **higher-resolution** coastline (Natural Earth 50m or Census cartographic
  boundary) — 110m is visibly coarse at state zoom.
- Optional CONUS bbox clip before intersect (cheap `turf.bboxClip`).
- Per-outlook-type toggles (e.g. trim probabilistic only, leave categorical manual).
- Custom product layers: separate toggle (default off).

### Phase 3 — Drawing aids (optional)

- Snap to coastline / state boundaries (`ol/interaction/Snap` with boundary source).
- Live preview overlay (render-only clipped layer) before users commit trim.

### Defer

- Line-side fill workflows.
- County-level masks (dataset size + performance).
- Alaska/Hawaii/Puerto Rico specialty domains (unless explicitly requested).

## Dataset inventory and licensing

### Already vendored (usable for prototype)

| Key | File | Size | Use for masking | License |
|-----|------|------|-----------------|---------|
| `usStates` | `public/geodata/us-states.json` | ~89 KB | State admin clip; blank basemap outlines | Public domain (Census TIGER via PublicaMundi) |
| `worldCountries` | `public/geodata/ne_110m_admin_0_countries.geojson` | ~820 KB | US exterior / coarse coastline | Public domain (Natural Earth) |
| `lakes` | `public/geodata/ne_110m_lakes.geojson` | ~37 KB | Subtract Great Lakes (+ other lakes in bbox) | Public domain (Natural Earth) |

Checksums and update process: `docs/geo-boundary-datasets.md`.

### Likely needed for production quality

| Dataset | Source | Est. size | License | Notes |
|---------|--------|-----------|---------|-------|
| US coastline / land polygon 50m | Natural Earth `ne_50m_land` or `admin_0` | 1–5 MB | Public domain | Better coastal detail |
| US cartographic boundary | US Census Cartographic Boundary files | varies | Public domain | Matches official map products |
| Great Lakes (detailed) | Census or NOAA | small | Public domain | Cleaner lake shore than 110m |
| CONUS clip box | SPC domain constants in code | 0 | n/a | Bbox only, no file |

**Maintenance:** Follow existing vendoring workflow (pin SHA-256 in
`geoBoundarySources.ts`, `validate-geo-assets.mjs` in CI). No mutable upstream URLs.

## Implemented prototype (branch `cursor/outlook-masking-investigation-2d35`)

Shipped for hands-on evaluation in the forecast editor:

| Mode | UI control | Behavior |
|------|------------|----------|
| **On-demand trim** | Layers → `Trim day now` or Tools → `Trim land` | Mutates all outlook polygons on the current day |
| **Auto on draw** | Layers → `Auto on draw` | Clips geometry when draw/modify completes |
| **Preview only** | Layers → `Preview only` | Cyan dashed overlay; Redux geometry unchanged |
| **Mask strategy** | Layers → `Mask` dropdown | `Coast + lakes`, `Coast only`, `State union` |

All modes default **off**. Controls live in **Layers → Trim to land** (popover trigger; toolbar height unchanged).



Code under `src/utils/outlookPolygonMasking/` implements **three land-mask
strategies** and two application styles:

| ID | Strategy | Application | Purpose |
|----|----------|-------------|---------|
| **A** | `us-country-minus-great-lakes` | `clipOutlookToLandMask` (mutate) | **Recommended MVP** |
| **B** | `us-states-union` | same clip helper | Compare admin union vs coastline |
| **C** | `us-country` | same clip helper | Coastline only, lakes still filled |
| **Preview** | any mask | `previewClipOutlookToLandMask` | Render-only experiments (no Redux) |

Run benchmarks/tests:

```bash
pnpm test src/utils/outlookPolygonMasking/outlookPolygonMasking.test.ts
```

Jest benchmark (from prototype tests) shows `us-states-union` build is
**much slower** than single-country masks while Gulf water removal is similar.

## Performance and mobile UX

| Concern | Assessment |
|---------|------------|
| Land mask build | Cache once per session; country minus lakes ~ms; states union ~1s |
| Per-polygon clip | Turf intersect on hand-drawn polygons: usually fine; batch trim on hundreds of features may need chunking + progress UI |
| Memory | +1–5 MB for 50m land polygon if added |
| Mobile draw | Auto clip on every vertex finish may feel laggy; prefer on-demand trim on mobile |
| Offline | Vendored assets work offline after first load |

**Mobile UX defaults:** keep toggle off; use explicit "Trim" action; show spinner
for batch operations; avoid auto-trim on every modify until performance is verified.

## UX specification (defaults and toggles)

| Setting | Default | Storage | UI location (proposed) |
|---------|---------|---------|------------------------|
| Trim outlooks to land (auto) | `false` | `overlaysSlice` or forecast settings | Map overlays / Draw tab |
| Trim includes Great Lakes | `true` when trim enabled | nested option | Sub-checkbox |
| Trim on draw/modify | `false` until user enables auto | same | Advanced checkbox |
| Trim current day / all days | action scope | modal on batch action | Tools tab |

**Copy suggestions**

- Toggle: "Trim outlooks to land (optional)"
- Help: "Removes outlook area over oceans and Great Lakes. Does not limit where you can draw. Off by default."
- Action: "Trim outlooks to land now"

Persist settings in local overlay preferences (same as `baseMapStyle`) unless we
need per-cycle settings later.

## Follow-up issues (split scope)

1. **#619-impl-1** — Land mask cache + on-demand trim action (MVP).
2. **#619-impl-2** — Auto trim on draw/modify (opt-in) + undo integration.
3. **#619-impl-3** — Higher-resolution coastline dataset vendoring.
4. **#619-impl-4** — CONUS domain bbox clip option.
5. **#619-impl-5** — Snap to coastline/state boundaries while drawing.
6. **#619-impl-6** — Custom layer masking toggles.
7. **#619-impl-7** — Export-only clipping mode (if non-destructive preview is required).

## Open questions for product owner

1. Should trim apply to **auto-generated categorical** polygons or only manual outlooks?
2. Alaska/Hawaii: use full US mask or CONUS-only envelope?
3. Is 110m acceptable for beta, with HQ coastline as fast follow?
4. Should trimmed geometry be **permanent** on batch trim, or always require confirm modal?

## References

- Issue: https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/619
- Geo datasets: `docs/geo-boundary-datasets.md`
- Blank basemap: `src/components/Map/openLayersBlankBasemap.ts`
- Turf patterns: `src/hooks/autoCategoricalProcessing.ts`
