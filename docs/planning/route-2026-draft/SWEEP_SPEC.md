# 2026 route rebuild: the midnight sweep

Owner direction, 2026-11-25, after reviewing the draft on a map. The draft (160 stops, 243,959 km) zig-zagged:
Brisbane to Honiara and back to Sydney, Göbekli Tepe to Helsinki and back to Istanbul, São Paulo to Greenland
(9,372 km) and on to Suriname (7,059 km). It passed every audit check because nothing measured doubling back.
The route is rebuilt from scratch on a different idea.

## The idea

Santa follows midnight west around the world in one continuous sweep, visiting as many places as he can.

1. **Westward sweep.** The route moves west with local midnight. An eastward leg is a defect unless it has a
   recorded, specific reason (see "Eastward legs"). "The local-time window forced it" is not a reason on its own:
   that means the ordering is poorly optimised.
2. **Local window 23:00 to 05:00.** Every delivery stop's local arrival time is between 23:00 on Dec 24 and 05:00
   on Dec 25 local time (owner decision). Aim for the middle of the window; do not use the window as slack for
   detours.
3. **Coverage first, then more stops.** Maximise the number of stops and the spread of places, in this order:
   every inhabited country and territory the sweep passes at a sensible time gets at least one stop; then fill in
   more stops along the path. There is no fixed total (the old `total: 160` is gone). Stop count is limited only
   by pacing.
4. **Geography decides.** Stops that force a detour are dropped or swapped for places on the path (owner
   decision). Category weights (hub, cultural, underserved, nature, special) become a tie-breaker for which place
   to pick nearby, not quotas.
5. **No hand-pinned order.** `routeOrderIds`, `arrivalAnchorMinutes` and per-offset caps are removed. The order
   comes from the algorithm, reproducibly from a seed.

## Fixed constraints (unchanged, owner-approved)

- Takeoff from the North Pole Dec 24 2026 10:00 UTC; return to the North Pole by Dec 25 14:00 UTC (28 h window).
- Each stop lasts 60 seconds (stop length is not what limits the count).
- Leg speed: p90 at most 20,000 km/h, hard max 25,000 km/h. Minimum 2 minutes between arrivals.
- No two stops closer than 100 km (configurable `minStopSeparationKm`), except a named major-city exception list
  (owner to confirm; Mexico City and Teotihuacan are the known case).
- Tone rules and the sensitive-place veto list from the current generator stay in force.
- Landmarks the owner expects to see should be candidates: Great Wall, Angkor, Machu Picchu.

## Eastward legs

An eastward leg (longitude moving east by more than 1 degree, after date-line unwrapping) is allowed only with a
machine-checkable reason code, recorded on the leg:

- `dateline`: the first legs after takeoff in the UTC+14/+13 Pacific, before the sweep is established.
- `offset-anomaly`: the destination's UTC offset puts its local midnight earlier than its longitude suggests
  (for example China on one zone, western Kazakhstan, Spain on UTC+1, Argentina on UTC-3), and visiting it later
  would break the 23:00-05:00 window.
- `return`: the final leg to the North Pole.

Any other eastward leg fails the audit. The audit also fails a leg whose distance is more than 2.5 times the
direct distance between the stops on either side of it (a detour). Every eastward leg and every detour flag is
listed in the review report with its reason.

## What the generator reports

Total stops, countries and territories covered, stops per continent, total path length, leg speed median, p90 and
max, local-arrival histogram, every eastward leg with its reason, the longest 20 legs, and the share of the world's
population within 500 km of a stop.
