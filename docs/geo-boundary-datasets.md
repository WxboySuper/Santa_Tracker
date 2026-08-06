# Runtime Boundary Datasets

The map renders several boundary/reference datasets at runtime. To keep the
product reproducible and immune to mutable upstream changes, these datasets are
vendored into the repository under `public/geodata` with pinned SHA-256
checksums and full provenance recorded in
`src/config/geoBoundarySources.ts`.

## Why vendored?

Previously these datasets were fetched from mutable upstream branch URLs (for
example `raw.githubusercontent.com/.../master/...`). A source change or outage
could alter or break the rendered map without a GFC release. Vendoring removes
that runtime dependency: the app now loads the exact revision that was reviewed
and checksummed at build time.

## Dataset inventory

| Key | File | Upstream origin | License | SHA-256 |
|-----|------|-----------------|---------|---------|
| `usStates` | `public/geodata/us-states.json` | [PublicaMundi/MappingAPI](https://github.com/PublicaMundi/MappingAPI) `data/geojson/us-states.json` | Public domain (US Census TIGER-derived) | `6F23ED91...80D193B` |
| `worldCountries` | `public/geodata/ne_110m_admin_0_countries.geojson` | [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) `geojson/ne_110m_admin_0_countries.geojson` | Public domain (Natural Earth) | `6866C877...39C977F` |
| `lakes` | `public/geodata/ne_110m_lakes.geojson` | [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) `geojson/ne_110m_lakes.geojson` | Public domain (Natural Earth) | `EB02ECC8...2D2FFC9` |

Retrieval date for all datasets: **2026-08-04**.

## Updating a dataset

1. Download the new revision from the upstream source.
2. Replace the file under `public/geodata`.
3. Update the `sha256` (and `retrievedAt`/`origin`) in `src/config/geoBoundarySources.ts`.
4. Run `node scripts/validate-geo-assets.mjs` locally to confirm the checksum matches.
5. CI runs the same validation on every pull request and will fail on mismatch.

## Integrity verification

`scripts/validate-geo-assets.mjs` recomputes the SHA-256 of every vendored file
and compares it against the checksum declared in `geoBoundarySources.ts`. It
runs in CI (`ci.yml`). Any drift between the checked-in file and its pinned
checksum fails the build so a modified or corrupted dataset can never ship
silently.

## Consumers

All runtime consumers resolve dataset URLs through
`getGeoBoundarySource(key)` in `src/config/geoBoundarySources.ts`:

- `src/components/Map/OpenLayersForecastMap.tsx` — blank basemap countries,
  lakes, and US states outlines.
- `src/components/Map/OpenLayersVerificationMap.tsx` — US state outlines.
- `src/monitor/components/monitorMapLayerUtils.ts` — monitor US state outlines.

No production runtime dependency uses a mutable upstream branch URL.
