# 2026 route generator

The generator creates a review draft from the committed place and timezone snapshots. Run commands from the
repository root. Its only outputs are `docs/planning/route-2026-draft/route.json` and `review.html`; it never writes
to `apps/web/data/santa_route.json`.

## Generate and audit

```sh
pnpm route:generate -- --seed 2026
pnpm route:audit
```

The seed, candidate snapshots, overrides and fixed `generated_at` timestamp determine the output. The generator
writes a North Pole `START`, a timed delivery node for every selected stop and a North Pole `END`.

## Sweep and pacing

Takeoff is 2026-12-24 10:00 UTC. The route follows local midnight west and must return by 2026-12-25 14:00 UTC.
Every delivery arrives between 23:00 Dec 24 and 05:00 Dec 25 at its destination. The scheduler uses the full
window instead of anchoring arrivals at 01:00. Stops south of 35 degrees latitude must arrive by 02:30 local time.
The generator targets 550-700 delivery stops, with a readability ceiling near 1,000. It has no fixed route total,
hand-pinned order, arrival anchor, UTC-offset cap or category quota. It favors a new country when its candidate fits
the current local cluster, fills dense clusters with short hops, then attempts one stop per remaining country in an
adjacent UTC-offset band. It reports countries it could not add while preserving the route constraints.

Stop dwell is tiered: `major` 60 seconds, `city` 30 seconds, `town` 10 seconds and `hop` 3 seconds. A major stop
has population at least 1,000,000, is a national capital with population at least 250,000, or is a curated
headline landmark in the `special` or `cultural` category. A city has population from 100,000 through 999,999, is
another national capital, or is another curated landmark. A town has population from 5,000 through 99,999. Other
stops and stops with unknown population are hops. Capital status can be supplied as `isNationalCapital` candidate
metadata; the current place and curated snapshots do not provide that field, so capital-only tier exceptions
cannot be identified from those snapshots yet.

Each arrival can follow the previous stop's dwell as soon as travel at the planned speed permits. There is no extra
minimum gap. The p90 leg speed is at most 20,000 km/h and no leg exceeds 25,000 km/h. Stops must be at least
20 km apart. Local legs use 4,000 km/h. Legs of at least 1,500 km use 19,000 km/h only for cross-continent, island
or polar crossings. Long overland legs use the local speed. The generator allows at most twelve stops per country.
Many countries reach that ceiling in the current draft, so it limits large place inventories while leaving room for
dense local clusters.

The seeded sweep buckets candidates by their committed Dec 24-25 UTC offset, including half-hour and quarter-hour
offsets. It moves west with local midnight and alternates its north-to-south or south-to-north latitude preference
by band. Neighboring bands can interleave while their six-hour arrival windows overlap if a nearby cluster avoids
a long regional deadhead. The nearest-neighbor open path gives feasible new countries priority, then favors nearby
stops and shorter dwell. Constrained 2-opt and or-opt moves stay inside one contiguous offset band and reduce path
length without adding eastward legs or detours. Candidate fill weighs country coverage, population, category and
extra path distance. The generator rejects unjustified eastward delivery legs; the initial date-line launch may be
marked `dateline`, and the final return may be marked `return`.

## Eastward legs and detours

An eastward leg is a date-line-unwrapped longitude change greater than 1 degree. Each such leg must carry
`transit_to_here.eastward_reason` with one of these values:

- `dateline`: an early crossing near the date line into UTC+13 or UTC+14, before the sweep is established.
- `offset-anomaly`: the destination offset makes local midnight earlier in UTC than the origin's, and arrival
  remains inside the destination's 23:00-05:00 window.
- `return`: the final leg to the North Pole.

Any other eastward leg is an audit failure. A detour is an interior stop where the two-leg path through it is more
than 2.5 times the direct distance between its neighbors. The audit fails detours unless that stop is the only one
for its country, in which case it reports a warning. Local search never increases either count.

## Data and review

`tools/route-generator/data/places.json` contains the populated-place snapshot. `curated.json` contains sourced
Wikidata cultural, nature and special candidates. `country-zones.json` records each country's IANA timezone
allow-list, timezone points and committed UTC offsets for Christmas 2026. The audit checks candidate coordinates
against committed country bounds and verifies timezone-country membership. The refresh scripts are available at
`tools/route-generator/refresh-country-bounds.mjs`, `refresh-curated.mjs` and `refresh-places.mjs`; refresh results
must be checked against the committed country bounds and zone allow-lists.

The current place and curated snapshots have no state, province or territory identifier. The generator cannot
verify US state, Canadian province or Australian state/territory coverage until the source data includes those
fields. The review reports this data gap and lists candidate country codes not reached by the route.

The generated HTML review includes delivery and eligible-candidate totals, the unselected candidate count, stop and
tier totals, country and continent coverage, UTC-offset band counts, uncovered candidate countries, path length,
median/p90/maximum leg speeds, local-arrival min/max and histogram, the share of delivery legs under 300 km, every
eastward leg with its reason, detour flags, the 20 longest legs and the share of the snapshot population estimate
within 500 km of a stop. That population share is a proxy based on the place records, not a gridded world-population
estimate.

`pnpm route:audit` checks the draft schema, endpoints, candidate identity, tier and dwell, local arrival window,
tone vetoes, source and coordinate data, duplicate locations, 20 km separation, travel chronology, speed, return
deadline, eastward reasons and detours. The old route is kept as a test fixture so the audit continues to reject
its eastward legs and geographic detours after the generated draft is replaced.

Promotion is a separate reviewed change. Never use `--remote` or `--activate` for draft work.
