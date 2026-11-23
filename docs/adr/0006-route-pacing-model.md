# ADR 0006: Route pacing model for 2026

**Status:** Proposed (owner approval required)
**Date:** 2026-11-23

## Context

Issue #241 asks for a comparison using the route generator. The run used committed candidate snapshots and seed 2026, with the same category weights, speed ceiling, and schedule rules. It changed only the total stop count: 120, the current 160 default, and 200. This tests a stop-density lever, not three fully distinct cinematic treatments. Evidence files were written under ignored `.scratch/route-pacing/`; generation never overwrote the committed route.

Command: `pnpm exec tsx tools/route-generator/generate.mts --seed 2026 --total N` from the repository root. The documented `pnpm route:generate -- --seed 2026 --total N` invocation was also attempted, but the package script could not resolve `tsx` in this Windows shell. Running the same generator entry point through `pnpm exec` succeeded after installing dependencies from the lockfile.

The generator orders stops across the Christmas timezone sweep, uses a 60-second stop, and permits up to 25,000 km/h per leg by default. Speed statistics below use the generated schedule and Haversine distance. Hour counts are relative to the first generated arrival. Hour buckets with no stops are omitted in the compact table. The generator's final eight buckets include Pacific-end time and expose sparse candidate coverage.

## Evidence

| Model | Stops | UTC-offset coverage counts (+5..+14 / +1..+4 / 0 / -1..-3 / -4..-7 / -8..-12) | Final 8 hourly stops | Lowest final-hour count | Median / p90 / max leg speed (km/h) | Legs above 15,000 km/h |
| --- | ---: | --- | --- | ---: | --- | ---: |
| Lower density, 120 stops | 120 | 29 / 30 / 4 / 8 / 42 / 7 | 14, 13, 1, 2, 3, 0, 0, 2 | 0 | 17,194 / 23,729 / 24,937 | 77 |
| Current default, 160 stops | 160 | 46 / 40 / 4 / 11 / 50 / 9 | 17, 13, 3, 2, 4, 1, 0, 2 | 0 | 17,620 / 23,414 / 24,897 | 97 |
| Higher density, 200 stops | 200 | 56 / 55 / 8 / 14 / 57 / 10 | 11, 12, 16, 3, 4, 1, 0, 2 | 0 | 17,655 / 23,428 / 24,897 | 126 |

The offset buckets are coarse counts from each generated stop's `timezone_offset`; they are not political or cultural region counts. The generator's region report records country strings, but the timezone buckets are more useful here for illustrating the thinning westward. None of the runs meets the configured minimum of four stops in each of the final eight hourly buckets. More stops barely change the lowest-hour result because the candidate data is sparse in the last Pacific offsets.

## Decision

Recommend a hybrid pacing prototype: preserve continuous motion between stops, then give selected regional anchors a richer story treatment. Keep the 160-stop default as a draft baseline until the owner reviews actual stop selection. Do not approve 120 or 200 solely from this run. Raise the final-hour gap as a route-production blocker under the separate Western Hemisphere threshold proposal in `docs/proposals/western-hemisphere-confidence.md`.

The generator evidence supports an important distinction: increasing stop count improves density across many hours but does not repair missing late-Pacific coverage. The route team should curate verified anchors for Alaska, Hawaii, and the final Pacific legs, then rerun the generator and validator. It should not invent stops to satisfy a numeric target.

## Consequences

- The prototype informs route production, but does not approve this generated route or its candidates.
- A richer treatment can coexist with continuous movement and does not change deterministic position calculation.
- The current configured four-stop hourly floor is not met in the last eight buckets and needs a reviewed validator policy.
- The generator and route-review page remain the evidence source. See [route generator documentation](../ROUTE_GENERATOR.md).
