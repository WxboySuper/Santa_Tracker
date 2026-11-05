# Configuration

The application reads environment variables through `process.env`. Production Worker values are configured in `apps/web/cloudflare.config.ts` and `.github/workflows/deploy-cloudflare-workers.yml`. Keep secrets out of `.env` files committed to Git.

## Application variables

| Name | Purpose | Default | Used by | Secret? |
| --- | --- | --- | --- | --- |
| `ADMIN_PASSWORD` | Password checked by the admin login route. | Unset; login is not configured. | `apps/web/src/lib/config.ts`, admin login | Yes |
| `SECRET_KEY` | Signs and verifies admin JWTs. | `dev-secret-key` in app config; set a strong value in production. | `apps/web/src/lib/config.ts`, auth helpers | Yes |
| `ADVENT_ENABLED` | Enables Advent pages and APIs. Recognizes `true` or `True`. | `false` when unset. Production Worker config sets `true`. | `apps/web/src/lib/config.ts`, Advent routes | No |
| `SEASON_OVERRIDE` | Opens both seasonal gates when set to `open`. | Seasonal schedule applies. | `apps/web/src/lib/access.ts` | No |
| `SANTA_STORAGE_BACKEND` | Chooses `r2` or filesystem snapshot storage. | Filesystem unless exactly `r2`. | `apps/web/src/lib/storage/index.ts`, Cloudflare bindings | No |
| `SANTA_DATA_ROOT` | Root directory for local data and filesystem snapshots. The store writes snapshots under `.versioned` below this root. | Existing `data` directory under the current working directory, otherwise `apps/web/data` there. | `apps/web/src/lib/config.ts`, filesystem storage | No |
| `SANTA_ROUTE_PATH` | Overrides the local route JSON path. | `santa_route.json` under the data root. | `apps/web/src/lib/config.ts` | No |
| `ADVENT_CALENDAR_PATH` | Overrides the local Advent JSON path. | `advent_calendar.json` under the data root. | `apps/web/src/lib/config.ts` | No |
| `NODE_ENV` | Controls whether admin auth cookies use the `Secure` attribute. | Set by the runtime or framework. | Admin login and logout routes | No |

For Workers, `SANTA_SNAPSHOTS` is an R2 binding, not an environment variable. `SANTA_STORAGE_BACKEND=r2` is set in the Worker config. The `SECRET_KEY` and `ADMIN_PASSWORD` Worker secrets are synced by the deploy workflow from GitHub Actions secrets.

## Tool and workflow variables

| Name | Purpose | Default | Used by | Secret? |
| --- | --- | --- | --- | --- |
| `VINEXT_BUILD` | Selects the vinext build config. | Unset; vinext mode only when `1`. | `apps/web/next.config.mjs` | No |
| `CLOUDFLARE_API_TOKEN` | Authenticates Wrangler for the remote snapshot publish and Worker deploy workflows. | Unset. | `.github/workflows/deploy-cloudflare-workers.yml`, Wrangler | Yes |
| `SANTA_R2_BUCKET` | Selects the bucket used by the snapshot publishing script. | `santa-tracker-snapshots`. | `tools/santa-publish.mjs` | No |
| `SMOKE_BASE_URL` | Optional base URL when running the smoke test without a positional URL. | Unset; the test requires a URL from one of those sources. | `tools/smoke-test.mjs` | No |
| `SMOKE_ADMIN_PASSWORD` | Admin password used by the deploy smoke test to log in. | Unset; the test requires a value. | `tools/smoke-test.mjs`, deploy workflow | Yes |

`CLOUDFLARE_API_TOKEN` and `SANTA_R2_BUCKET` belong in the trusted deployment workflow. Do not set up local remote publishing as part of ordinary development.

## Local setup

Install and start the app with:

```sh
pnpm install
pnpm bootstrap
```

To preview Advent outside its normal season and keep edits in a temporary directory, set:

```sh
SANTA_DATA_ROOT=./.tmp-advent SEASON_OVERRIDE=open pnpm dev
```

See [Development](DEVELOPMENT.md) for the PowerShell form and more detail.

**Never run `tools/santa-publish.mjs --remote` or Wrangler write commands locally. The local Wrangler login can write to production R2.**
