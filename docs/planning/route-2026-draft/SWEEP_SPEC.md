# 2026 route model: time-window orienteering

Owner direction, 2026-11-28: follow local night westward while keeping the route geographically useful. Local arrival hours are a near-hard limit. Coverage and a larger stop count do not justify daytime loops.

## The model

The generator builds a deterministic time-window orienteering tour from the committed candidate snapshot and a seed.

1. **Coverage seed.** Choose at least one stop for every sovereign state represented in the candidate pool. All 50 US states and DC, all 10 Canadian provinces and 3 territories, and all 8 Australian states and territories remain mandatory. Non-sovereign territories are optional. Keep the reviewed ISO alpha-2 territory list in `packages/route-engine/src/generate/coverage.ts`; it includes remote islands and populous territories such as Puerto Rico, Guam, Greenland, Hong Kong, Macau, French Polynesia, New Caledonia, Réunion, Curaçao, Aruba, and Bermuda. Remote or sparsely populated territories may be added only when both new adjacent legs are at most 3,000 km. Order timezone bands westward as local midnight advances, then improve the path without sending the tour back to an earlier local night.
2. **Optional stops.** Insert candidates by marginal route cost, weighted by population and candidate importance. Keep each country at or below 12% of deliveries, and US plus Canada at or below 20%. Prefer additional stops in populous countries such as India, China, Indonesia, Brazil, Nigeria, Pakistan, Bangladesh, Japan, Germany, the UK, France, Mexico, and Russia. Stop at 700 deliveries or when the time budget has no feasible insertion. The target remains 550 to 700 stops.
3. **Route cost.** Measure travel time and add penalties for eastward backtracking, arrivals outside 23:00 to 05:00 local, detours, and region crossings. Arrivals from 23:00 to 05:00 are preferred. Up to 15% may use the 22:30–22:59 or 05:01–05:30 shoulders. Any arrival outside 22:30 to 05:30 is infeasible. The local label is `GREEN` from 23:00 to 05:00, `YELLOW` from 22:30 to 22:59 or 05:01 to 05:30, and `RED` outside that range.
4. **Hard limits.** Keep every leg at or below 25,000 km/h, return by Dec 25 14:00 UTC, and retain mandatory sovereign-state and admin-1 coverage. The audit reports sovereign-state coverage and lists visited and skipped territories. At least 97% of arrivals must land from 23:00 to 05:00 local; any remaining stops must land in the 22:30–22:59 or 05:01–05:30 shoulders. Keep stops at least 20 km apart except where mandatory coverage requires a recorded tiny-territory exception. Mandatory stops are never dropped. If they cannot fit the time budget, report the binding constraint and affected coverage.

The seed is the sole tie-break input. Given the same seed and input snapshots, generation is deterministic. Category weights break close ties; they do not set quotas.

## Clock and pacing

- Takeoff is Dec 24 10:00 UTC from the North Pole. Return by Dec 25 14:00 UTC.
- Use 5,000 km/h for hops under 400 km, 15,000 km/h for regional legs, and the 25,000 km/h ceiling only for ocean crossings and longer gaps. Route distance and travel time lead the cost; eastward backtracking, local arrival windows, detours, and region crossings add modest penalties.
- Aim for median leg speed near 5,000 km/h or less and p90 at or below 15,000 km/h. These are route-quality targets; the generator may exceed them to meet the return budget and preserve mandatory coverage.
- At least 97% of stops must arrive between 23:00 and 05:00 local. Any remaining stops must arrive between 22:30 and 05:30, and the audit verifies each status label against the recorded local time.
- No country may exceed 12% of deliveries. US and Canada together may not exceed 20%. The audit reports per-country counts and fails a route that breaks either cap.
- Keep stops at least 20 km apart.
- A mandatory country representative may use the recorded spacing exception only when every available candidate conflicts with another mandatory stop. All remaining pairs must still meet the 20 km minimum.
- Stop durations remain brief: major places 30 seconds, cities 20 seconds, towns 5 seconds, and hops 3 seconds.
- Tone rules, source validation, and the sensitive-place veto list remain in force.

## Recorded exceptions and route quality

Every eastward leg over 1,500 km carries a reason. The reason can describe a date-line crossing, a timezone offset anomaly, or a deliberate orienteering choice that improves coverage or saves schedule time. A mandatory spacing exception is recorded on the inbound leg and in report issues. Short eastward legs remain in the report and contribute to the direction penalty. Delivery legs over 4,000 km, excluding launch and return, must name the specific mandatory sovereign state or admin-1 unit they serve and confirm that long-leg reinsertion was checked.

The audit detects repeated long north-south reversals, reports speed percentiles and the longest legs, and lists the reason attached to each eastward leg over 1,500 km. Delivery legs over 4,000 km must serve mandatory coverage; optional insertions may not create an unjustified leg over that limit. The generator aims for 550 to 700 stops, median leg speed at or below about 5,000 km/h, and p90 at or below 15,000 km/h. It also reports the local arrival-hour histogram and sovereign-state coverage so reviewers can check the route.
