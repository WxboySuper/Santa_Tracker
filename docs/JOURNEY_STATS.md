# Journey statistics and replay

The route package derives both live statistics and replay frames from the same route instant. It has no wall clock, random source, or UI dependency. Keep the route and its location catalog together as a saved snapshot when recording a season. A catalog entry must exist for every `locationId` in the route.

## Statistics

Call `deriveJourneyStats(route, instant, locations)`, where `instant` is a `Date` or epoch milliseconds and `locations` is a list of `RouteStatsLocation` records keyed by stop ID. Coordinates, country, time zone, and optional population come from that snapshot because the canonical route stores only IDs and schedules.

Distance uses great-circle distance between consecutive route stops. A leg advances linearly between the previous stop's departure and the next stop's arrival. Dwell time adds no distance. The remaining distance is total distance minus distance travelled. This measures the scheduled route, not the sleigh's live GPS position.

Stops count as visited at their arrival timestamp. `stopsRemaining` is total stops minus visited stops. A visited country's normalized ISO 3166-1 alpha-2 code is included once in `countriesVisited`. An explicit `countryCode` takes priority; otherwise the country name is matched through `Intl.DisplayNames` with aliases for common names such as USA, UK, and South Korea. Unknown country names are omitted. `timeZonesCrossed` counts distinct time zone identifiers among visited stops.

Flight time counts only transit intervals, from one stop's departure to the next stop's arrival. Elapsed flight time counts the portion before the requested instant. Remaining flight time counts the portion after it. Journey elapsed and remaining time span first arrival through final departure, including stop visits. At an instant before takeoff, progress values are zero and all time remains. At or after final departure, the route is complete and no distance, stops, or time remain.

`currentSpeedKmh` is the scheduled average speed of the active transit leg and is zero while stopped. `averageSpeedKmh` is distance travelled divided by elapsed transit time. Both are zero when no transit time has elapsed.

Magical estimates are fixed arithmetic, not measured facts. Their dry, friendly tone belongs in the caller's labels or explanatory copy:

- Presents delivered: floor of 20% of the population summed across visited stops. This is a deliberately generous estimate, not a count of real recipients.
- Cookies eaten: two cookies per estimated present. Santa has clearly found a system.
- Reindeer snacks: nine per visited stop, one for each reindeer. The route does not record snack inventory.
- Chimneys visited: ceiling of presents divided by four. This is an estimate of workload, not a census of chimneys.

The formulas use only cumulative visited stops and a clamped route progress, so distance travelled and all playful counts never decrease as time advances. Identical route, catalog, and instant inputs produce identical results.

Stats are returned as raw numbers. Use `formatStat(value, locale)` or the app's equivalent `Intl.NumberFormat` call only at the presentation boundary. Durations are milliseconds and distances are kilometres.

## Replay API

```ts
const replay = createReplay(routeSnapshot, {
  locations: locationSnapshot,
  speed: 2,
  startAt: takeoffTimestamp,
});

replay.play(performance.now());
const frame = replay.at(performance.now());
replay.pause(performance.now());
replay.seek(0.5, performance.now()); // fraction of first arrival through final departure
replay.seek(new Date('2026-12-25T00:00:00Z'), performance.now());
replay.setSpeed(4, performance.now());
replay.reset(performance.now());
```

Playback speed ranges from 0.5x through 64x. `seek` accepts a fraction from 0 through 1 or an absolute `Date`/epoch timestamp. Times outside the route are clamped to first arrival or final departure. Control methods accept the same injected wall clock used by `at`; `at(wallClockNow)` is read-only and returns a new `Date`, the journey timestamp, `JourneyState`, `JourneyStats`, speed, and play status. `reset` returns to the configured `startAt`, or first arrival by default, and pauses.

The controller copies the route and location records at creation. An archive can therefore play its saved route and metadata without consulting the current season configuration. Store versioned route and location snapshots together if old replay data must survive future catalog edits.

## UI consumption

The UI owns the animation loop and supplies its monotonic wall clock to `at`. Render `frame.state` for the existing journey state and `frame.stats` for route counters. Use `frame.time` as the instant for maps and other time-dependent views. A live tracker should call `deriveJourneyState` and `deriveJourneyStats` with the same route, metadata, and journey instant. That gives live and replay views the same values. Keep language, number formatting, and the distinction between scheduled measurements and magical estimates in the presentation layer.
