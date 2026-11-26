# 2026 route rebuild: banded midnight sweep

Owner direction, 2026-11-25. Santa follows local midnight west around the world and visits as many places as the
flight window allows. Tiny hops are welcome because they add coverage.

## Route objective

1. Bucket places by their committed Dec 24-25 UTC offset, including half-hour and quarter-hour offsets as separate
   bands. Finish each band before moving west to the next. Within a band, use an open nearest-neighbor path and
   alternate the preferred latitude direction north-to-south, then south-to-north, from one band to the next.
   Constrained 2-opt and or-opt improvements stay within contiguous same-band segments.
2. Reserve one feasible stop for every country or territory before population-weighted dense filling. Where the
   candidate snapshot has admin identifiers, also reserve at least one stop per US state, Canadian
   province/territory, and Australian state/territory. If a required representative cannot fit the complete route,
   report it as uncovered. Then fill dense regions with short, population-weighted hops, including nearby towns and
   villages and feasible remote bridge stops that shorten gaps between regions. Respect 20 km separation throughout.
3. The candidate snapshots currently have no state, province, territory, or other subnational identifiers. Report
   this data gap and do not claim subnational coverage without those identifiers. List candidate countries or
   territories the route could not reach.
4. Maximize stop count subject to the local-time window, dwell, speed and return constraints. Target 550-700 stops;
   the readability ceiling is about 1,000. There is no fixed route total, pinned sequence, arrival anchor, offset cap
   or category quota.
5. Keep the route westward. An eastward leg is allowed only when its record has a `dateline`, `offset-anomaly` or
   `return` reason. The local-time window alone does not justify backtracking.

The route should chain dense nearby candidates before moving west. When a remaining country's candidate cannot fit
the route constraints, list that country in the review report. The current candidate snapshot has no subnational
identifier, so US state, Canadian province/territory and Australian state/territory coverage cannot be measured.
Report that data gap.

## Timing and stop tiers

- Takeoff is 2026-12-24 10:00 UTC. Return by 2026-12-25 14:00 UTC.
- Arrive from 23:00 Dec 24 through 05:00 Dec 25 at each destination. South of 35 degrees south, arrive no later
  than 02:30 local time.
- Major stops dwell 60 seconds: population at least 1,000,000, a national capital with population at least 250,000,
  or a curated headline landmark in the `special` or `cultural` category.
- City stops dwell 30 seconds: population 100,000-999,999, another national capital, or another curated landmark.
- Town stops dwell 10 seconds: population 5,000-99,999.
- Hop stops dwell 3 seconds: population below 5,000 or unknown.
- A stop can begin after the prior stop's dwell and travel time. There is no extra arrival gap.
- Keep p90 leg speed at or below 20,000 km/h and every leg at or below 25,000 km/h. The generator uses a smooth
  4,000 km/h pace for local legs and 19,000 km/h for long ocean, island, cross-continent and polar crossings.
  Transit time follows distance at that pace, rounded up to a whole second so the stored transit duration never
  understates the schedule; dwell time comes out before the next leg.
- Stops must be at least 20 km apart. This permits nearby pairs such as Mexico City and Teotihuacan without an
  exception list.

## Country limit

The generator allows at most twelve stops per country. This ceiling keeps the largest national inventories from
using the dense-fill budget after every country has had a representative selected. The seeded sweep prioritizes
feasible country coverage, then fills dense clusters. Unreachable countries remain in the report.

## Eastward legs and detours

Measure longitude movement after date-line unwrapping. An eastward leg is movement by more than 1 degree. Each
eastward leg must store `transit_to_here.eastward_reason` with one of these values:

- `dateline`: an early leg near the date line into the UTC+13 or UTC+14 Pacific, before the sweep is established.
- `offset-anomaly`: the destination's UTC offset puts local midnight earlier than its longitude suggests, and the
  destination is still inside its arrival window. Examples include China's single time zone, western Kazakhstan,
  Spain on UTC+1 and Argentina on UTC-3.
- `return`: the final leg to the North Pole.

Any other eastward leg fails review. A detour is a stop where the two-leg path through it is more than 2.5 times the
direct distance between its neighboring stops. Local search must not add eastward legs or detours.

## Required report

Report stop count and tier counts, countries and territories covered, uncovered candidate countries, subnational
coverage gaps, stop counts by UTC-offset band, path length, median/p90/maximum leg speed, local-arrival min/max and
hourly histogram, the share of delivery legs under 300 km, every eastward leg and its reason, detour flags, and the
20 longest legs. Keep the population estimate within 500 km as a separate candidate-snapshot proxy.

Expected landmark candidates include the Great Wall, Angkor Wat and Machu Picchu. Never use a third-party Santa
route as candidate data or as a source for route ordering.
