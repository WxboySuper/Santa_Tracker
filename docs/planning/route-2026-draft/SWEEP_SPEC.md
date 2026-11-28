# 2026 route model: time-window orienteering

Owner direction, 2026-11-27: reach more stops when the schedule allows. The route should favor local midnight and westward travel, but those preferences do not outweigh useful nearby stops or mandatory coverage.

## The model

The generator builds a deterministic time-window orienteering tour from the committed candidate snapshot and a seed.

1. **Coverage seed.** Choose at least one stop for every country or territory in the candidate pool. Reserve all 50 US states and DC, all 13 Canadian provinces and territories, and all 8 Australian states and territories. Choose representatives that stay at least 20 km apart. Order the seed roughly by the UTC time local midnight arrives, then improve it with 2-opt and or-opt moves.
2. **Optional stops.** Repeatedly insert the candidate with the lowest marginal route cost while the North Pole return remains within 28 hours. Stop at 700 deliveries. The generator records any coverage or schedule limit that prevents the target range of 550 to 700 stops.
3. **Route cost.** Measure travel time and add soft penalties for eastward backtracking, arrivals outside 23:00 to 05:00 local, detours, and long region crossings. The eastward penalty reflects lost local-time progress, so short hops and movement within a region stay cheap. The arrival penalty grows with the time outside the window; a 30 minute miss has little weight.
4. **Hard limits.** Keep every leg at or below 25,000 km/h, return by Dec 25 14:00 UTC, retain mandatory country and admin-1 coverage, and keep every pair of stops at least 20 km apart. Mandatory stops are never dropped. If they cannot fit, report the binding constraint and affected coverage.

The seed is the sole tie-break input. Given the same seed and input snapshots, generation is deterministic. Category weights break close ties; they do not set quotas.

## Clock and pacing

- Takeoff is Dec 24 10:00 UTC from the North Pole. Return by Dec 25 14:00 UTC.
- Use 4,000 km/h for regional legs and 15,000 km/h for long crossings. The 25,000 km/h maximum is a hard ceiling, not a target.
- Aim for median leg speed near 5,000 km/h or less and p90 at or below 15,000 km/h.
- Prefer arrival between 23:00 and 05:00 local. Outside arrivals are allowed when they buy useful stops or preserve required coverage; the audit reports them as a soft-rule cost.
- Keep stops at least 20 km apart.
- Stop durations remain tiered: major places 60 seconds, cities 30 seconds, towns 10 seconds, and hops 3 seconds.
- Tone rules, source validation, and the sensitive-place veto list remain in force.

## Recorded exceptions and route quality

Every eastward leg over 1,500 km carries a reason. The reason can describe a date-line crossing, a timezone offset anomaly, or a deliberate orienteering choice that improves coverage or saves schedule time. Short eastward legs remain in the report and contribute to the direction penalty.

The audit detects repeated long north-south reversals, reports speed percentiles and the longest legs, and lists the reason attached to each eastward leg over 1,500 km. A leg longer than 4,000 km needs a recorded reason; an ocean crossing is a valid reason. The generator aims for 550 to 700 stops, 5,000 km/h median speed, and 15,000 km/h p90 speed. These targets guide route cost; hard limits and mandatory coverage take precedence.
