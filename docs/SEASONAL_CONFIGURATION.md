# Seasonal configuration

The typed configuration contract contains the seasonal mode, four registered feature flags, and active snapshot ID. `SnapshotSchema` requires that configuration inside every canonical immutable snapshot. Legacy route files remain in their existing format until converted by the publishing path.

## Environments and defaults

Configuration is stored under `season/config/<environment>.json` for `development`, `preview`, and `production`. `SANTA_ENVIRONMENT` selects the runtime environment when it contains one of those values. Otherwise a production Node runtime uses `production`, and other local runtimes use `development`.

The registry defaults are Advent off, map on, weather off, and soundscape off. A stored flag override contains `enabled` and `expiresAt`. Use `null` for an override without an expiry. At or after a timestamp expiry, the flag reverts to its registry default. Unknown keys or malformed stored config cause the whole environment record to fall back to registry defaults.

## Admin API

`GET /api/admin/season-config?environment=preview` returns the stored state and effective configuration. The response includes an ETag. `PUT` requires that ETag in `If-Match` and replaces the override map:

```json
{
  "overrides": {
    "weatherEnabled": { "enabled": true, "expiresAt": "2026-12-01T12:00:00.000Z" },
    "soundscapeEnabled": { "enabled": false, "expiresAt": null }
  },
  "reason": "Preview the optional weather panel"
}
```

The write records actor, server time, reason, and prior and next overrides. Missing ETags return 428. Stale ETags return 412.

## Preview before publication

`POST /api/admin/season-config/preview` does not write configuration. Supply an environment, canonical UTC timestamp, and candidate override map:

```json
{
  "environment": "preview",
  "at": "2026-12-01T09:00:00.000Z",
  "overrides": {
    "mapEnabled": { "enabled": false, "expiresAt": null },
    "weatherEnabled": { "enabled": true, "expiresAt": "2026-12-01T12:00:00.000Z" }
  }
}
```

The response reports effective mode, effective flags, expired flag names, environment, and active route snapshot ID. The preview lets the operator see expiration behavior at the chosen time before saving or publishing.

All admin endpoints require the signed admin session and return `Cache-Control: private, no-store`.
