# Local Christmas Eve rehearsal

The scripts in `tools/rehearsal/` run against a local Next.js dev server. They create a route fixture in the operating system temp directory and remove it when the rehearsal ends. They never invoke Wrangler, publish data, or connect to Cloudflare.

Prerequisites: Node 22.18 or later, pnpm 10, dependencies installed, and port 4317 free. Run these commands from the repository root.

## Run the timeline rehearsal

```sh
pnpm rehearsal
```

The script starts a local server with a fixed November clock and no season override to confirm the public tracker page and `/api/route` return 404 while closed. It checks the route API's `private, no-store` header. Then it restarts the server with `SEASON_OVERRIDE=open` and the mock clock set to each timeline instant. At every point it checks `/tracker`, `/api/route`, Santa coordinates, journey completion, progress, and leg index.

Expected output includes one closed-season pass and these timeline cases:

```text
PASS closed season tracker=404 route=404 cache=private, no-store
PASS before takeoff tracker=200 route=200 complete=false leg=waiting ...
PASS at takeoff     tracker=200 route=200 complete=false leg=0 ...
PASS mid-route      tracker=200 route=200 complete=false leg=1 ...
PASS final stop     tracker=200 route=200 complete=true leg=3 ...
PASS after landing  tracker=200 route=200 complete=true leg=3 ...
```

The exact coordinates depend on the fixture calculation. Any assertion failure exits nonzero. `LOCAL_REHEARSAL_TIME` is an optional server clock input for repeatable local checks. `apps/web/src/lib/clock.ts` ignores it whenever `NODE_ENV=production`.

## Run the local load check

The load runner starts a local server with `SEASON_OVERRIDE=open` and a scratch data directory, then cleans both up when it finishes. Run:

```sh
pnpm load:local
```

The script sends requests to `/tracker`, `/api/route`, and `/api/health` with 300 concurrent workers for 30 seconds. It prints request count, non-2xx/network error rate, and p50/p95/p99 response latency per path. Customize the local run with `LOAD_CONNECTIONS` (1 to 1000), `LOAD_DURATION_SECONDS`, and `LOAD_PORT`. It always binds to `127.0.0.1`. A nonzero error rate fails the command.

Use the percentiles to spot slow tails and compare runs on the same machine, with the same build, fixture, and settings. These numbers measure the local Next.js server and machine. They do not measure Cloudflare's edge cache, Worker CPU limits, R2 latency, global network paths, or production traffic patterns. A green local run is a regression check, not evidence of edge capacity.

## Christmas Eve checklist

- [ ] Review and approve the 2026 route and its schedules.
- [ ] Run `pnpm typecheck`, `pnpm lint`, `pnpm lint:css`, and the focused season/access/route tests.
- [ ] Run `pnpm rehearsal` and `pnpm load:local` on the release commit. Save the outputs with the launch notes.
- [ ] Check uptime monitoring for `/` and `/api/health` and make sure the owner can see alerts.
- [ ] Confirm the launch owner has the approved route, rollback runbook, and monitoring dashboards ready.
- [ ] At 09:50 UTC, check `/tracker` and `/api/route` as a visitor. Confirm the map position updates and the health endpoint responds.
- [ ] Keep an eye on errors through the flight and verify the tracker closes at the scheduled season boundary.

This kit is local-only. Do not point it at a public hostname.
