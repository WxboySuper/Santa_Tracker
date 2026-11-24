# 2026 route generator

The route generator creates review drafts from committed snapshots. Run every command from the repository root. Generation writes only to `docs/planning/route-2026-draft/`; the production route at `apps/web/data/santa_route.json` is not an output target.

## Generate and audit

```sh
pnpm route:generate -- --seed 2026
pnpm route:audit
```

The committed draft contains `route.json` and a self-contained `review.html`. The generator refuses output paths outside the draft directory or the operating system's temporary directory. The audit regenerates into a temporary directory and compares SHA-256 hashes for both committed files.

The default route has 160 delivery stops, `route_version: "2026-draft-1"`, and the fixed generation timestamp from `config.json`. That timestamp is intentionally a documented, non-future value; running the generator does not stamp the current clock into the route. The seed-2026 ordering baseline and tie breaking are committed in `config.json`, so the same seed, snapshots, overrides, and configuration produce identical files.

## Selection rules

Category counts are allocated from the weights in `config.json`. A stop is a `hub` only when it is a Natural Earth world city or has population of at least 250,000. At least 36 of the 48 hubs must be world cities or have population of at least 1.5 million. The `underservedCountries` ISO alpha-2 list is also in `config.json`; it supplies smaller populated places where the selected coverage needs them. The audit checks the hub definition, category totals, every selected population record, and country limits.

The `requiredStopIds` list pins the sourced icons and city anchors named in the route brief, including Sydney, Auckland, Cairo/Giza, London, New York, Tokyo, Rio, Eiffel Tower, Stonehenge, Cordoba, Great Barrier Reef, and Giant's Causeway. `requiredCountries` reserves Egypt, Nigeria, Ghana, and Senegal so the Africa minimum includes the requested examples. The audit checks both lists.

The 2026 selection must represent every populated UTC offset present in the eligible candidate pool. It also enforces these regional minimums and limits:

- Western and Northern Europe: at least 14 stops.
- Australia and New Zealand: at least 8.
- Pacific islands, including Fiji, Samoa, Tonga, and Hawaii: at least 6.
- Africa, including Egypt and West Africa: at least 22.
- Middle East: at least 8.
- Greenland or Arctic Canada: at least 1.
- Americas: no more than 35% of stops; South America: no more than 20; Bolivia: no more than 4.
- Each country: no more than 6 stops and no run longer than 2 consecutive stops.

The configured opening sequence uses populated places, including Kiritimati, Tabuaeran, Apia, Nuku'alofa, and Auckland. The route starts at a North Pole `START` node at 2026-12-24 10:00 UTC, includes a launch leg, and ends with a North Pole `END` node. The last delivery departure must be no later than takeoff plus 27 hours; the return must arrive by takeoff plus 28 hours. At most four uninhabited island stops are allowed, none among the first five, and the final delivery must be populated or iconic.

The seed-2026 draft's `lock`, `veto`, `swap`, timezone/offset, and display-name overrides are committed in `tools/route-generator/data/route-2026-overrides.json`. An optional ignored `tools/route-generator/overrides.json` overlays those values for local experiments, and `--overrides` can add a one-off file. The committed draft locks the sourced icons and vetoes Dzhankoy, Kursk, Zelenodolsk, Bikini Atoll, and Point Barrow; Utqiagvik is retained.

## Time zones and reproducibility

`tools/route-generator/data/country-zones.json` commits the per-country IANA zone allow-list and zone-point data from tzdb 2026c. Every stop's snapshot also stores its IANA timezone and the UTC offset for December 25, 2026. The generator uses that committed offset to calculate local Christmas arrival times; it does not ask the host's Node ICU data to assign offsets while generating. The audit uses the committed timezone table to verify country membership and local arrival dates, so Node 22 and Node 26 produce the same draft.

The refresh scripts use the exact `@photostructure/tz-lookup` 11.8.0 dependency pinned in `package.json` and `pnpm-lock.yaml`. Coordinate lookup can be wrong near timezone borders, so refresh is only a starting point. Validate each result against the country allow-list and correct border cases through the override mechanism. The audit rejects a timezone-country mismatch, a timezone outside the country's IANA list, a snapshot offset inconsistent with its IANA zone record, or a local arrival outside December 25, 00:20–03:00.

The populated-place snapshot is Natural Earth's public-domain populated-places data. Curated cultural, nature, and special candidates use sourced Wikidata IDs and links; the snapshot includes coordinates and ISO alpha-2 country codes. Do not invent coordinates. Refresh snapshots only when intentionally changing the data source, then review all derived changes:

```sh
node tools/route-generator/refresh-places.mjs
node tools/route-generator/refresh-curated.mjs
```

## Ordering and pacing

The 2026 route uses the committed seed order as its deterministic starting point. A 2-opt and relocate pass, followed by seeded simulated annealing, can improve the full path while preserving country runs, anchor order, time-window feasibility, and the fixed opening and ending stops. Candidate routes that violate those constraints are rejected. Eastward legs over 8 degrees are penalized; the audit allows at most 3 and checks total path length, including launch and return.

The local arrival window is 00:20–03:00 in each stop's real IANA zone. The scheduler requires at least 4 minutes and allows no more than 40 minutes between consecutive arrivals; the return leg may take up to 60 minutes. Every complete interior UTC flight hour must contain at least 4 stops. The route targets a median leg speed between 6,000 and 14,000 km/h, p90 no higher than 20,000 km/h, and a hard ceiling of 25,000 km/h. The old per-leg `maxGapKm` limit was removed: travel feasibility is controlled by the 40-minute arrival-gap limit and 25,000 km/h speed ceiling, while the 185,000 km total path limit covers route-wide distance. A separate kilometer cap would duplicate those checks and could reject a long leg that is still feasible within the flight window.

## Audit and current draft status

`pnpm route:audit` prints one PASS/FAIL row for every mechanical rule. It checks the route schema and app loaders, start/return nodes, per-stop sources and transit data, timezone-country matching, local arrival dates, offsets, quotas, country runs, vetoes, duplicate/separation rules, island limits, flight window, pacing, UTC-hour coverage, route distance, eastward legs, review-page fields, and deterministic regeneration. The corresponding pure checks have Vitest coverage, and `pnpm test` includes the committed-draft audit assertion.

The committed seed-2026 draft passes the stop, region, timezone, country, opening/ending, flight-window, arrival-gap, source, schema, hourly-coverage, and determinism checks. It includes Cape Verde and Praia for populated UTC-1 coverage. The current route is 240,652 km including launch and return, 55,652 km over the 185,000 km limit, with three eastward legs over 8 degrees. Its median leg speed is 10,286 km/h, p90 is 20,000 km/h, and the North Pole return arrives at 2026-12-25 14:00 UTC. Earlier ordering experiments reduced distance only while missing required clock hours; this draft has no hour below four stops. The selected stops' minimum spanning tree is about 130,032 km, so it does not prove the 185,000 km target impossible. The audit preserves the distance threshold and reports the remaining failure. Do not promote this draft while the route-length or hourly-coverage checks fail.

## Review and promotion

Open `docs/planning/route-2026-draft/review.html` to inspect per-stop order, name, country, UTC and local arrival, IANA timezone, coordinates, category, and source link. The page also shows per-leg distance and speed, balances by continent, subregion, UTC offset, and hour, named warnings, and the owner decisions for Palmyra, Timbuktu, Leptis Magna, Dome of the Rock, and Robben Island.

Promotion is a separate reviewed change. First resolve every audit failure and get product approval for the review page. A future promotion PR may copy the reviewed route into `apps/web/data/santa_route.json` and run the normal application checks. This documentation and the audit do not activate, deploy, publish, or write any production data; never use `--remote` or `--activate` for draft work.
