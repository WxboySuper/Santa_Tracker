# Admin route snapshots

Route versions are immutable JSON objects under `santa-route/versions/`. Admin snapshot APIs can inspect and validate a saved version, activate a validated version, or roll back to the immediately previous version. All endpoints require the signed admin session and return `Cache-Control: private, no-store`.

## Read and validate

`GET /api/admin/route/snapshots` returns the active pointer and versions newest first. Use the active pointer's `updatedAt` value as the next write's `If-Match` value.

`POST /api/admin/route/snapshots` validates one saved version:

```json
{"versionId":"<version-id>"}
```

The report includes whether the route can be activated, a SHA-256 checksum of its exact stored bytes, the legacy route schema, season year, and any route issues. Warnings are included but do not block activation.

## Activate or roll back

`POST /api/admin/route/snapshots/:versionId` activates that version. Send the latest pointer timestamp in `If-Match` and a reason in the JSON body:

```http
If-Match: "<updatedAt>"
Content-Type: application/json
```

```json
{"reason":"Restore the reviewed route after rehearsal"}
```

`POST /api/admin/route/snapshots/rollback` uses the same headers and body and selects the immediately previous version. Missing `If-Match` returns 428, a stale value returns 412, a missing version returns 404, and a failed validation returns 422. The active pointer stores the switch and its audit entry together, so readers never observe a new active version without its corresponding actor, reason, prior version, checksum, and timestamp.

These calls are for controlled admin use. Local API tests use temporary filesystem storage. Never run a production activation as part of development or CI.
