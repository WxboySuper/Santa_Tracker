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

The documented profile is 300 concurrent workers for 30 seconds. The original run starts Next.js in development mode and uses a 10-second request timeout. This run completed with exit code 1:

| Endpoint | Requests | Errors | Error rate | p50 | p95 | p99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/tracker` | 371 | 371 | 100.00% | 10012.8 ms | 10192.8 ms | 10258.0 ms |
| `/api/route` | 371 | 213 | 57.41% | 10003.1 ms | 10193.8 ms | 10257.4 ms |
| `/api/health` | 371 | 198 | 53.37% | 10002.0 ms | 10194.7 ms | 10257.8 ms |

Total observed throughput was 37.1 requests/second (1113 completed requests divided by 30 seconds). This profile saturated the local development server and hit the runner timeout. It is not a successful load result and says nothing about production capacity.

I also built the vinext bundle and started its local Cloudflare preview runtime:

```powershell
$env:VINEXT_BUILD = '1'
pnpm santa:publish
pnpm --filter @santa-tracker/web exec vite build
pnpm --dir apps/web exec vite preview --host 127.0.0.1 --port 4319
```

The build completed. Local `GET /api/health` returned 200, but `/api/route` and `/tracker` returned 404. The generated Worker configuration fixes `SANTA_STORAGE_BACKEND=r2` and binds `SANTA_SNAPSHOTS`; the preview therefore uses the local Cloudflare R2 emulator rather than the application's filesystem backend. It also had no active route snapshot, and the tracker season was closed on the run date. I stopped there to keep the rehearsal on the requested filesystem backend. A comparable vinext load profile is infeasible under that constraint without a code/config change to make the production build use the filesystem adapter. This local run does not establish Cloudflare edge capacity.

## #325, map outage and emergency switch

Commands:

```text
pnpm exec playwright test e2e/immersive-tracker.spec.ts --project=open -g "TV mode keeps the text route readable when both map layers fail"
pnpm exec playwright test e2e/map-outage.spec.ts --project=open
pnpm exec playwright test e2e/open-season.spec.ts --project=open -g "the admin emergency switch hides and restores the tracker for visitors"
```

The existing outage test passed with both public tile providers blocked. The new deterministic local spec blocks `tiles.openfreemap.org` and `tile.openstreetmap.org`, confirms a raster request follows the vector failure, waits for the text view, verifies the TV dashboard stays visible, and checks `/api/route` is unchanged across the outage. On the post-rebase run, vector-to-raster took 182 ms and raster-to-text took 239 ms. The journey remains available in text mode.

The emergency switch test passed against the E2E suite's isolated filesystem store. It logged in with a generated local test password, hid the tracker, observed visitor `404` responses for `/tracker` and `/api/route`, then restored the flag and observed `/tracker` return `200`. No real secret or production backend was used.

## #326, snapshots and backup recovery

The admin endpoint `GET /api/admin/backup/export` exports route locations. The new local-only restore script validates that format, converts it to the route snapshot format, and writes one version through the filesystem versioned store. It refuses to overwrite an active route. It has no R2 binding or Wrangler path.

Command:

```text
pnpm exec playwright test e2e/backup-restore.spec.ts --project=open
```

The local drill passed against the isolated E2E filesystem fixture. It fetched the backup export through the authenticated admin API, saved and activated an original route snapshot, activated a changed snapshot, rolled back to the original version, and verified the active snapshot matched. It restored the backup through the script into a clean temporary data directory and verified the restored route document against the export. The export contained 185 locations.

```text
BACKUP_RECOVERY versions=2026-11-23T19-36-13-883Z-r8a98zqb,2026-11-23T19-36-14-026Z-0tltieuq rollback=2026-11-23T19-36-13-883Z-r8a98zqb restored=2026-11-23T19-36-14-344Z-ekvu4k61 locations=185
```

For a standalone restore from an existing export, use:

```text
pnpm exec tsx tools/rehearsal/restore-backup.ts --input <export.json> --data-dir <empty-local-data-dir>
```

```text
NOT RUN: requires production access: inspect or change production R2 pointers, restore a live R2 backup, or verify production recovery.
```

No production access was used. Production pointer restore remains open. The local filesystem activation/rollback/export/restore drill passed.

## #327 and #328, runbook review

The rollback, cache purge, uptime, and launch-readiness docs correctly warn against local remote writes, describe the 120-second public route cache window, and distinguish health checks from data-health checks. The documented production write examples remain operator-only procedures and were not run.

Gaps found:

- The launch checklist calls for rehearsal outputs to be saved, but did not link a run record. This file supplies local evidence and keeps production evidence separate.
- There is no admin restore endpoint. The new operator script covers local filesystem recovery only; production restore remains an approved R2 operator action.
- The built vinext preview requires the local R2 binding and had no active route snapshot; it does not use the app filesystem adapter. With the filesystem-only constraint, it could not provide a comparable load run.
- `pnpm load:local` can now target an explicitly supplied loopback origin through `LOAD_ORIGIN`; it still starts Next dev by default.
- The existing outage test covered both providers failing together. The new test adds a check that the raster request occurs after the vector failure and records local fallback timing.
- There is no staging Worker rehearsal. Production R2 pointer restore, Worker rollback, cache purge, monitoring delivery, and edge load remain owner-run tasks.

## Repository checks

After the documentation and runner changes:

```text
pnpm lint       PASS
pnpm typecheck  PASS
pnpm test       PASS, 76 files and 519 tests
```

## Owner checklist

- [ ] Review and approve `docs/planning/route-2026-draft/review.html` and Advent content.
- [ ] Decide whether to keep local-only rehearsals or approve a separate throwaway Worker and isolated bucket for edge rehearsals.
- [ ] Decide whether to add a safe filesystem backend option to the vinext runtime so it can be load-tested locally without the Cloudflare R2 emulator.
- [ ] Arrange an approved edge-capacity check; local measurements do not measure Cloudflare edge capacity.
- [ ] Review and adopt the local restore script's route-field mapping before relying on it for any operator recovery.
- [ ] Rehearse production R2 restore through the approved operator process.
- [ ] Review the rollback, cache purge, and change-control runbooks before launch.
- [ ] Configure uptime alerts and verify delivery to the launch owner.
- [ ] Approve any production R2 pointer change, live cache purge, production smoke test, and deploy through the approved operator workflow.
- [ ] Keep all production writes and deploys out of this local report. `NOT RUN: requires production access` applies to those operations.
