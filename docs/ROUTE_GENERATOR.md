# 2026 route generator

The generator creates a review draft. It never changes the production route at `apps/web/data/santa_route.json` and it makes no network requests. Its inputs are committed snapshots under `tools/route-generator/data/`.

## Generate a draft

Install the workspace dependencies, then run:

```sh
pnpm route:generate -- --seed 2026
```

The default output has 160 stops. Mix weights and guardrails live in `tools/route-generator/config.json`. Use `--total 180` to change the count, or `--overrides path/to/overrides.json` to apply owner decisions. The CLI writes `tools/route-generator/out/santa_route.json` and a self-contained `tools/route-generator/out/review.html`. Both files are local output and are ignored by Git.

The seed controls candidate selection and tie breaking. Running the same seed with the same snapshots and overrides produces the same route and report. The draft keeps the legacy `{ meta, route_nodes }` shape and the generator validates both the route contract and its geographic legs before writing it.

## Review and edit the candidate list

Open `review.html` directly in a browser. It includes the category mix, timezone-region balance, stop counts by hour, longest legs, and a sortable and searchable stop table. Check the local arrival, long-gap and fast-leg flags, and repeated countries. The final eight hours show the hourly counts for the western part of the sweep. A below-target hourly count appears as a warning because the candidate source has very few verified places in UTC-11 and UTC-12; the report leaves those gaps visible instead of inventing stops.

Copy `tools/route-generator/overrides.example.json` to `tools/route-generator/overrides.json` and put owner decisions there. Use candidate IDs copied from the `review.html` table. `lock` keeps a candidate selected, `veto` removes it, and `swap` replaces a selected ID with another candidate ID:

```json
{
  "lock": ["Q12345"],
  "veto": ["ne-987654"],
  "swap": { "ne-123456": "Q67890" }
}
```

Regenerate with the same seed and the override file. The generator rejects unknown IDs, conflicts, duplicate selections, and country runs that cannot satisfy the configured cap. Review the new report before approving or manually editing the route.

## Data sources

Populated places come from Natural Earth's `ne_10m_populated_places_simple` dataset, which is public domain. The curated cultural, nature, and special candidates start from Wikidata QIDs in `tools/route-generator/data/curated-seeds.json`; refresh writes their labels, country claims, coordinates, source URLs, and category to the committed snapshot. Wikidata data is CC0. `tools/route-generator/data/README.md` records source URLs, licences, snapshot dates, and refresh commands.

Natural Earth has no timezone field. The refresh scripts use the pinned `@photostructure/tz-lookup` 11.7.0 library for both sources. It runs locally from coordinates, so generation needs no network. Timezone borders for remote islands and disputed regions can be approximate; check those arrivals in the report.

To update snapshots, run `node tools/route-generator/refresh-places.mjs` and `node tools/route-generator/refresh-curated.mjs`, then review the derived JSON changes. Do not add hand-entered coordinates. If a Wikidata item has no country claim, the refresh script stops so its location can be reviewed instead of guessed.
