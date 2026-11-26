# Launch-day emergency controls

The admin API provides audited controls for incident response. It cannot change Santa's route, speed, pause state, or clock offset. Existing tracker and Advent hides remain at `/api/admin/feature-flags`.

## Admin API

`GET /api/admin/emergency-controls` reads the state and returns an ETag. `PUT` replaces the full value and requires that ETag in `If-Match`:

```json
{
  "noMap": true,
  "simplifiedTracker": false,
  "killedFeatures": { "weather": true, "soundscape": false },
  "reason": "Map tile provider is unavailable"
}
```

The API requires a signed admin session and a non-empty reason of at most 500 characters. A missing ETag returns 428. A stale ETag returns 412 without writing. Every accepted change records actor, server time, reason, and complete prior and next values.

## Runtime API

`GET /api/runtime-controls` returns only `noMap`, `simplifiedTracker`, `killedFeatures`, and `updatedAt`. It is private/no-store and contains no audit data. Runtime clients should apply these presentation switches without changing route timing or position. If stored data is malformed or unavailable, this endpoint returns no-map mode, simplified mode, and all optional kills enabled.

The snapshot activation API validates a target version before changing the active route pointer. The admin experience should display the validation report and require operator confirmation with an activation reason before sending the request. See [Admin route snapshots](ADMIN_SNAPSHOTS.md).
