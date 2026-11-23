# Launch readiness rehearsal evidence, November 2026

This run used branch `docs/readiness-run-2026-11` from `origin/main` on 2026-11-23. All application requests in this report targeted `127.0.0.1`; test data used temporary local directories. No Wrangler command, deploy, production write, or public-host request was made.

## #322, accelerated journey

Command: `pnpm rehearsal`

The first attempt failed before assertions because this fresh worktree had no `node_modules`. After `pnpm install --frozen-lockfile`, the first real run passed the closed-season assertions but failed while stopping Next.js on Windows. `stopServer` killed the parent process but left its child alive. The rehearsal and load runners now use `taskkill /T /F` on Windows before their existing fallback cleanup.

The rerun passed all cases against the local Next.js development server and a temporary route fixture:

```text
PASS closed season tracker=404 route=404 cache=private, no-store
PASS before takeoff  tracker=200 route=200 complete=false leg=waiting position=90.00,0.00
PASS at takeoff      tracker=200 route=200 complete=false leg=0 position=90.00,0.00
PASS mid-route       tracker=200 route=200 complete=false leg=1 position=49.93,66.74
PASS final stop      tracker=200 route=200 complete=true leg=3 position=90.00,0.00
PASS after landing   tracker=200 route=200 complete=true leg=3 position=90.00,0.00
```

The kit restarts Next for each injected time. It reports per-request durations in server logs, not total case runtimes. This rehearsal validates the fixture and dev server, not the 2026 draft route or a production build.

## #323, local load profile

Command: `pnpm load:local`

The documented profile is 300 concurrent workers for 30 seconds. The script starts Next.js in development mode; it does not support an external server or a vinext production build. The request timeout is 10 seconds. This run completed with exit code 1:

| Endpoint | Requests | Errors | Error rate | p50 | p95 | p99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/tracker` | 371 | 371 | 100.00% | 10012.8 ms | 10192.8 ms | 10258.0 ms |
| `/api/route` | 371 | 213 | 57.41% | 10003.1 ms | 10193.8 ms | 10257.4 ms |
| `/api/health` | 371 | 198 | 53.37% | 10002.0 ms | 10194.7 ms | 10257.8 ms |

Total observed throughput was 37.1 requests/second (1113 completed requests divided by 30 seconds). This profile saturated the local development server and hit the runner timeout. It is not a successful load result and does not establish Cloudflare edge capacity. A vinext production-mode local run was not performed because the current runner hardcodes `next dev` and the docs provide no production runner command.

## #325, map outage and emergency switch

Commands:

```text
pnpm exec playwright test e2e/immersive-tracker.spec.ts --project=open -g "TV mode keeps the text route readable when both map layers fail"
pnpm exec playwright test e2e/map-outage.spec.ts --project=open
pnpm exec playwright test e2e/open-season.spec.ts --project=open -g "the admin emergency switch hides and restores the tracker for visitors"
```

The existing outage test passed with both public tile providers blocked. The new deterministic local spec blocks `tiles.openfreemap.org` and `tile.openstreetmap.org`, confirms a raster request follows the vector failure, waits for the text view, verifies the TV dashboard stays visible, and checks `/api/route` is unchanged across the outage. It passed with measured local delays of 170 ms vector-to-raster and 372 ms raster-to-text. The journey remains available in text mode.

The emergency switch test passed against the E2E suite's isolated filesystem store. It logged in with a generated local test password, hid the tracker, observed visitor `404` responses for `/tracker` and `/api/route`, then restored the flag and observed `/tracker` return `200`. No real secret or production backend was used.

## #326, snapshots and backup recovery

The versioned filesystem store and route activation/rollback APIs exist, and the existing unit suite covers save, activate, read, and rollback. This run did not complete the requested end-to-end snapshot activation and backup restore rehearsal.

The admin endpoint is `GET /api/admin/backup/export`. It exports route locations. There is no matching backup restore endpoint. `POST /api/admin/locations/import` accepts a location list and creates/activates a route snapshot, but it is not a general backup restore operation and the export response is not accepted as-is. A recovery drill needs an explicit conversion procedure or a purpose-built restore workflow with validation. No local restore was attempted without a reliable, documented path.

```text
NOT RUN: requires production access: inspect or change production R2 pointers, restore a live R2 backup, or verify production recovery.
```

No production access was used. The local activation/rollback/export/restore sequence remains open.

## #327 and #328, runbook review

The rollback, cache purge, uptime, and launch-readiness docs correctly warn against local remote writes, describe the 120-second public route cache window, and distinguish health checks from data-health checks. The documented production write examples remain operator-only procedures and were not run.

Gaps found:

- The launch checklist calls for rehearsal outputs to be saved, but did not link a run record. This file supplies local evidence and keeps production evidence separate.
- The backup export route has no corresponding restore route, and the rollback runbook does not document the local filesystem snapshot/restore sequence.
- `pnpm load:local` is described as an ordinary local load check but always starts Next dev mode. It cannot target the vinext production-mode server described in the issue request.
- The existing outage test covered both providers failing together. The new test adds a check that the raster request occurs after the vector failure and records local fallback timing.
- There is no staging Worker rehearsal. Production R2 pointer restore, Worker rollback, cache purge, monitoring delivery, and edge load remain owner-run tasks.

## Repository checks

After the documentation and runner changes:

```text
pnpm lint       PASS
pnpm typecheck  PASS
pnpm test       PASS, 75 files and 515 tests
```

## Owner checklist

- [ ] Review and approve `docs/planning/route-2026-draft/review.html` and Advent content.
- [ ] Decide whether to keep local-only rehearsals or approve a separate throwaway Worker and isolated bucket for edge rehearsals.
- [ ] Run a local vinext production load profile after the runner can target a built server; then arrange an approved edge-capacity check.
- [ ] Define and rehearse a filesystem backup restore procedure, including the route export/import shape and the versioned active pointer.
- [ ] Run and record a local end-to-end publish, activate, rollback, and restore drill.
- [ ] Review the rollback, cache purge, and change-control runbooks before launch.
- [ ] Configure uptime alerts and verify delivery to the launch owner.
- [ ] Approve any production R2 pointer change, live cache purge, production smoke test, and deploy through the approved operator workflow.
- [ ] Keep all production writes and deploys out of this local report. `NOT RUN: requires production access` applies to those operations.
