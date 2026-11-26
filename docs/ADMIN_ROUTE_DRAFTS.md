# Admin route drafts and restore points

Route autosaves live in the separate `santa-route-draft` dataset. Saving a draft never changes the active published `santa-route` pointer. Each successful save creates an immutable version and advances only the draft pointer. Writes use `If-Match`; a stale editor receives HTTP 412 and the current draft state so it can reload or compare before retrying.

`GET /api/admin/route/draft` returns the current draft, or the published route as the initial value when no draft exists. Its `ETag` is the revision token for the next write. `PUT /api/admin/route/draft` accepts `{ "data": <route document> }` and requires the current `If-Match`. Autosaves are retained even when incomplete, with a validation result in the response so an operator can keep working without mistaking a partial draft for a valid route.

Named restore points are created with `POST /api/admin/route/revisions` using `{ "name": "..." }` and the current `If-Match`. `GET /api/admin/route/revisions` lists them. To compare two points, request `GET /api/admin/route/revisions?left=<id>&right=<id>`. Restore a point with `POST /api/admin/route/revisions/<id>/restore`, again with the current draft `If-Match`. Restore writes a new draft version; it does not change the published route or delete later autosaves.

All endpoints require the existing admin credential. Nothing in this draft API publishes or activates a route snapshot.
