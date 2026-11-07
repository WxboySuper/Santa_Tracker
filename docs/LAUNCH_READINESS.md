# Launch readiness

What has to be true before Advent opens (Nov 30 00:00 UTC; Day 1 at Dec 1 12:00 UTC) and before the tracker opens (Dec 24, 09:50 UTC). Written from a read of the repo on 2026-11-06. Items marked **gap** are not built or not rehearsed yet.

## What already protects launch

Operational procedures: [rollback runbook](ROLLBACK_RUNBOOK.md), [cache purge](CACHE_PURGE.md), and [uptime checks](UPTIME.md).

- **Season gates.** The tracker and Advent return `404` with `Cache-Control: private, no-store` to visitors outside their windows. Admin sessions bypass. `SEASON_OVERRIDE=open` is local only and is not set in production.
- **Data never changes by accident.** Ordinary pushes publish snapshots to R2 without moving the active pointer. Activation is an explicit manual dispatch (`activate_dataset`) of the deploy workflow. See [DEPLOY.md](DEPLOY.md).
- **Smoke test after every deploy.** `tools/smoke-test.mjs` checks the production host, including an admin login and gated data.
- **Public route API is cached briefly** (`s-maxage=60, stale-while-revalidate=60`), so the tracker's polling is absorbed at the edge.
- **Admin login** is throttled per client IP, body-capped, and sessions expire after 12 hours.

## Emergency switch

Open `/admin` and use the **Emergency switches** panel. Turn on **Hide tracker** or **Hide Advent**, then confirm. Visitors receive the same uncached 404 used outside the feature's season. The admin session can still preview a hidden feature. Turn the switch off to restore the normal season schedule. The switches can never open a feature outside that schedule.

The switches are stored as a standalone key through the configured storage backend. Production uses the `SANTA_SNAPSHOTS` R2 binding; local development uses the filesystem store. This key does not use the route or calendar dataset activation pointer.

The Worker caches the flag read for up to 7 seconds. `/api/route` has a 60-second shared cache lifetime and a 60-second stale-while-revalidate window. A visitor may therefore see an already cached route response for up to 120 seconds after a hide is saved, plus the 7-second Worker flag cache: worst case about 127 seconds. Other gated responses are private and not cached. Verify in a private browser session by requesting `/tracker` and `/api/route`; the page should show the not-found response, and the API should return 404 with `Cache-Control: private, no-store`. The admin preview should remain available.

The Worker keeps the last successfully read, valid flag document in memory per isolate. If a later storage read fails or returns corrupt data, it continues using that last-known-good document, so a saved hide survives a transient storage problem. Failed reads are cached for at most 7 seconds before retrying. On a cold isolate with no valid read yet, or when the key is missing, defaults preserve the regular season schedule; storage trouble on startup never hides a feature by accident. Requests continue using the normal season rules.

## Gaps to close before December

1. **Rollback rehearsal (gap).** The [rollback runbook](ROLLBACK_RUNBOOK.md) documents Worker rollback and recovery of a versioned R2 dataset. Rehearse against a non-live dataset before Dec 24; never run remote write commands from a developer workstation.
2. **Rehearsal against a copy (gap).** There is no staging environment. Rehearse the Dec 24 flow locally with shifted schedule times (the Playwright suite in `e2e/` already does this for the tracker) and, if wanted, on a throwaway Worker name that does not share the production R2 bucket.
3. **Load test (gap).** Run a local or throwaway-Worker load test of `/api/route` and the tracker page at a realistic burst (hundreds of requests per second for a few minutes) to confirm edge caching holds. Do not load-test the production hostname without the owner's approval.
4. **Monitoring rehearsal (gap).** Configure the checks and alert thresholds in [UPTIME.md](UPTIME.md), then verify notifications before launch. Check Cloudflare analytics and Worker error logs once before launch.
5. **Cache purge procedure.** Follow [CACHE_PURGE.md](CACHE_PURGE.md) after a live route or flag change. `/api/route` can remain at the edge for up to 120 seconds; Advent APIs already return `private, no-store`.
6. **Content freeze and review (gap).** Owner reviews the generated 2026 route (`docs/planning/route-2026-draft/review.html`) and the Advent text. After the route is approved, activation is a deliberate, announced step, not an automatic one.

## Dates and checks

| When | Check |
| --- | --- |
| By Nov 25 | Route approved and activated; emergency switch and rollback runbook done and rehearsed. |
| Nov 29 | Dry run: admin sees `/advent` and every day; visitors still get `404`. Smoke test green. |
| Nov 30 00:00 UTC | Advent window opens. Check `/advent` as a visitor within 10 minutes. |
| Dec 1 12:00 UTC | Day 1 unlocks. Check the door on a phone. |
| Dec 23 | Full tracker rehearsal with shifted times; uptime checks on; owner has the runbook open. |
| Dec 24 09:50 UTC | Tracker window opens (10 minutes before takeoff at 10:00 UTC). Watch `/api/health`, the route API, and the map. |
| Dec 25-Jan 7 | Replay week. Gate closes automatically at Jan 7 00:00 UTC. |

## Owner decisions needed

For the local tracker rehearsal, load test, and Christmas Eve checklist, see [REHEARSAL.md](REHEARSAL.md).

- Leave or roll back the R2 data rewrite from the accidental local `--remote --activate` test on 2026-11-05 (the live Advent pointer was replaced by the checked-in calendar). The prior versions are kept in R2.
- Approve a throwaway Worker for rehearsal and load tests, or keep everything local.
