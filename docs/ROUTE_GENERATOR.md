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

Category counts are allocated from the weights in `config.json`. A stop is a `hub` only when it is a Natural Earth world city or has population of at least 250,000. At least 45 of the 48 hubs must be world cities or have population of at least 1.5 million. The `underservedCountries` ISO alpha-2 list is also in `config.json`; it supplies smaller populated places where the selected coverage needs them. The audit checks the hub definition, category totals, every selected population record, and country limits.

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

The configured opening sequence uses populated places, including Kiritimati, Tabuaeran, Apia, Nuku'alofa, and Auckland. The route starts at a North Pole `START` node at 2026-12-24 10:00 UTC, includes a launch leg, and ends with a North Pole `END` node. The last delivery departure must be no later than takeoff plus 27 hours. The return must arrive no later than takeoff plus 27 hours 45 minutes, leaving at least 15 minutes inside the 28-hour countdown window. At most four uninhabited island stops are allowed, none among the first five, and the final delivery must be populated or iconic.

`tools/route-generator/data/route-2026-overrides.json` locks the seed-2026 stop list. `swap` is the supported way to replace a selected stop: remove the old candidate from `lock`, add the sourced replacement candidate to `lock`, then map the old candidate ID to the replacement ID in `swap`. The target must be locked, and the source must not remain in the final lock. This keeps the reviewed selection stable across generation.

To let selection choose stops again, edit the committed override file in a working branch: clear its optional `lock` array and `swap` object, then regenerate. Do not expect an optional ignored `tools/route-generator/overrides.json` or `--overrides` file with empty arrays to erase committed locks; override files are merged additively. `requiredStopIds`, `openingStopIds`, `endStopId`, and `ownerDecisionIds` in `config.json` remain pinned after clearing the optional lock, so remove a config pin only when it is intentionally no longer required. The committed draft vetoes Dzhankoy, Kursk, Zelenodolsk, Bikini Atoll, and Point Barrow; Utqiagvik is retained.

## Time zones and reproducibility

`tools/route-generator/data/country-zones.json` commits the per-country IANA zone allow-list and zone-point data from tzdb 2026c. Every stop's snapshot also stores its IANA timezone and the UTC offset for December 25, 2026. The generator uses that committed offset to calculate local Christmas arrival times; it does not ask the host's Node ICU data to assign offsets while generating. The audit uses the committed timezone table to verify country membership and local arrival dates, so Node 22 and Node 26 produce the same draft.

The refresh scripts use the exact `@photostructure/tz-lookup` 11.8.0 dependency pinned in `package.json` and `pnpm-lock.yaml`. Coordinate lookup can be wrong near timezone borders, so refresh is only a starting point. Validate each result against the country allow-list and correct border cases through the override mechanism. The audit rejects a timezone-country mismatch, a timezone outside the country's IANA list, a snapshot offset inconsistent with its IANA zone record, or a local arrival outside December 25, 00:20–03:00.

The populated-place snapshot is Natural Earth's public-domain populated-places data. Curated cultural, nature, and special candidates use sourced Wikidata IDs and links. The snapshot includes the Great Wall, Angkor Wat, Machu Picchu, Mexico City, and principal towns for inhabited territories missing from Natural Earth's city list. `tools/route-generator/data/COVERAGE.md` lists every ISO 3166-1 country or territory, its candidate and Dec 25, 2026 timezone offset, and ISO entries without permanent civilian populations. Country bounds combine Natural Earth admin-0 countries and map units, with documented adjustments for northern Cyprus, Flying Fish Cove, Cape Horn, and remote territories attached to Australia, France, the UK, and the US. Do not invent candidate coordinates.

```sh
node tools/route-generator/refresh-country-bounds.mjs
node tools/route-generator/refresh-curated.mjs
node tools/route-generator/refresh-places.mjs
```

The refresh checks candidate coordinates against committed country bounds and removes a duplicate named place when its Natural Earth and Wikidata points are within 100 km. Mexico City is 48.5 km from Teotihuacan, inside the 100 km separation rule. Both remain candidates for the generator to resolve.

## Ordering and pacing

The 2026 route uses the committed seed order as its deterministic starting point. A 2-opt and relocate pass, followed by seeded simulated annealing, can improve the full path while preserving country runs, anchor order, time-window feasibility, and the fixed opening and ending stops. Candidate routes that violate those constraints are rejected. Eastward legs over 8 degrees are penalized; the audit allows at most 3.

The local arrival window is 00:20–03:00 in each stop's real IANA zone. The scheduler requires at least 4 minutes and allows no more than 40 minutes between consecutive arrivals; the return leg may take up to 60 minutes. Every complete interior UTC flight hour must contain at least 4 stops. The route targets a median leg speed between 6,000 and 14,000 km/h, p90 no higher than 20,000 km/h, and a hard ceiling of 25,000 km/h. The old per-leg `maxGapKm` limit was removed: travel feasibility is controlled by the 40-minute arrival-gap limit and 25,000 km/h speed ceiling. The 245,000 km total path cap is a separate route-wide owner decision; it measures all delivery legs plus launch and return.

## Audit

Run `pnpm route:audit` from the repository root. Each mechanical rule prints a named PASS or FAIL line with its measured details. Coverage and path length are informational reports, not acceptance limits.

The audit keeps route schema and app-loader validation, START/END structure, candidate identity, the local arrival window, tone vetoes, source and coordinate checks, duplicate detection, 20 km minimum stop separation, leg timing, speed limits, and flight-window validation. Every DELIVERY stop must arrive between 23:00 Dec 24 and 05:00 Dec 25 in its committed local UTC offset. Each stop tier must be one of `major`, `city`, `town`, or `hop`, and its `stop_experience.duration_seconds` must be 60, 30, 10, or 3 seconds respectively. Population bands follow the sweep spec: major starts at one million, capital cities at 250,000 or more are major, city starts at 100,000, and town starts at 5,000. The `special` category or an explicit `headlineLandmark` flag marks a curated headline landmark as `major`; other curated landmarks and capitals use `city`; unknown populations use `hop` unless the stop is a curated landmark or capital.

An eastward leg means the shortest date-line-unwrapped longitude change is more than 1 degree east. Every such leg must name a plausible `transit_to_here.eastward_reason`. `dateline` is valid only on a leg that crosses the date line before the route first reaches a stop at UTC+12 or lower, and only while the destination is still east of UTC+12. `offset-anomaly` is valid only when the destination's local midnight, calculated as 00:00 minus its committed UTC offset, occurs earlier in UTC than the origin's local midnight. `return` is valid only on the final leg to END. The report lists every eastward leg and its reason.

A detour check examines each interior stop. It flags the stop when its incoming and outgoing great-circle distances add up to more than 2.5 times the direct distance between its neighboring stops. If that stop is the route's only stop for its country or territory, the audit lists it as a warning instead of a failure. The audit has no fixed delivery count, UTC-offset caps, category quotas, regional minimums, or total path-length cap.

The informational report lists stop and country/territory counts, per-continent counts, total path length, the longest 20 legs, local-arrival hours, stop-tier counts, and the share of summed population records in `tools/route-generator/data/places.json` within 500 km of a stop. That population share is a proxy based on the places dataset, not a world-population grid. `pnpm route:audit` is expected to fail on the superseded route draft until its order and stop data satisfy the sweep checks.

## Review and promotion

Open `docs/planning/route-2026-draft/review.html` to inspect per-stop order, name, country, UTC and local arrival, IANA timezone, coordinates, category, and source link. The page also shows per-leg distance and speed, balances by continent, subregion, UTC offset, and hour, named warnings, and the kept owner decisions for Timbuktu, Leptis Magna, and Robben Island. Dome of the Rock, Palmyra, Lashkar Gah, and Zhangaozen were replaced with sourced stops at the same category and UTC offset.

Promotion is a separate reviewed change. First resolve every audit failure and get product approval for the review page. A future promotion PR may copy the reviewed route into `apps/web/data/santa_route.json` and run the normal application checks. This documentation and the audit do not activate, deploy, publish, or write any production data; never use `--remote` or `--activate` for draft work.
