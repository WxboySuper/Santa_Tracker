# Architecture

## Runtime

`apps/web` is the application entry point. It uses the Next.js App Router and runs in production as a Cloudflare Worker through vinext. The Worker handles page and API requests. The Cloudflare assets binding serves built static files.

Public route data is returned by `/api/route`; the browser calculates Santa's position from the route snapshot with `packages/route-engine`. Advent manifest and day APIs check the server clock before returning unlocked content. Admin pages and `/api/admin/*` use a signed admin session.

## Snapshot storage

The versioned snapshot store holds route and Advent data, including admin edits. Production uses the `SANTA_SNAPSHOTS` R2 binding. Local development uses the filesystem backend at `apps/web/data/.versioned`; set `SANTA_DATA_ROOT` to choose another data root. The checked-in JSON files under `apps/web/data/` seed snapshots.

PostgreSQL and `packages/database` were removed. The old Postgres and Drizzle decisions in [ADR 0001](adr/0001-application-architecture.md) are historical. [ADR 0003](adr/0003-drop-postgres-r2-snapshots.md) records the current storage decision.

## Season access

`apps/web/src/lib/season.ts` defines public windows. The tracker opens at 09:50 UTC on December 24 and closes at 00:00 UTC on January 7. Advent opens at 00:00 UTC on November 30 and closes at the same January boundary. Closed pages and APIs return 404 to visitors. A valid admin session bypasses the seasonal gate. `SEASON_OVERRIDE=open` opens both features for local or preview use.

Advent day N unlocks at 12:00 UTC on December N. The day page selects a renderer by content type in `apps/web/src/components/advent/day-content.tsx`. Facts and stories render text; games render a same-origin embed. Other content types use the fallback until a renderer exists. The activity SDK is in `packages/activity-sdk`. Day 1 embeds `apps/web/public/advent/ornament-smash/`.

## Workspace packages

- `route-engine`: journey state, great-circle geometry, and geometry validation.
- `contracts`: shared Zod schemas and stable IDs.
- `config`: typed application configuration.
- `localization`: locale resources and helpers.
- `ui`: shared React components.
- `activity-sdk`: lifecycle helpers for embedded activities.
- `test-fixtures`: clocks, routes, snapshots, and fixtures used by tests.

`apps/web` composes these packages. The Flask/Python sources in `src/` and `archive/` are retired. They are not imported by the production app; Python workflows only run archival checks.

## Hosting and deployment

Cloudflare Worker settings and bindings are defined in `apps/web/cloudflare.config.ts`, with a matching Wrangler reference in `apps/web/wrangler.toml`. `.github/workflows/deploy-cloudflare-workers.yml` builds and deploys the Worker, syncs the admin secrets, and runs a smoke test. The workflow can opt in to replacing one live dataset during a manual run.

The repository still contains release-triggered VPS workflows. They describe a retired deployment path and are not the current production target. See [Deployment](DEPLOY.md) for the active path and this legacy exception.
