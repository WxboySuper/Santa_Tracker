# Santa Tracker

Santa Tracker is a Next.js app in a pnpm workspace. The production app runs on Cloudflare Workers through vinext. The former Flask app remains under `src/` and `archive/` for historical reference; neither is part of the live runtime.

## Local development

Requirements: Node.js 22.13 or newer and pnpm 10 or newer.

```sh
pnpm install
pnpm bootstrap
```

`pnpm bootstrap` checks the tool versions and starts the development server at `http://localhost:3000`. To start it directly, use `pnpm dev`. Local route and Advent changes use the filesystem snapshot store.

## What is in the workspace

- `apps/web`: Next.js pages, APIs, admin tools, and the vinext Worker entry point.
- `packages/route-engine`: journey state, great-circle geometry, and geometry validation.
- `packages/contracts`: shared schemas and stable IDs.
- `packages/config`: shared configuration.
- `packages/localization`: localized content and helpers.
- `packages/ui`: shared UI components.
- `packages/activity-sdk`: lifecycle helpers for Advent activities.
- `packages/test-fixtures`: clocks, routes, snapshots, and legacy fixtures.
- `src/` and `archive/`: retired Flask/Python code, kept for historical reference and archival checks.

Production route and Advent snapshots live in the `SANTA_SNAPSHOTS` R2 bucket. Local development uses `apps/web/data/.versioned`, which is gitignored. PostgreSQL and `packages/database` were removed; see [ADR 0003](docs/adr/0003-drop-postgres-r2-snapshots.md).

## Season access

The tracker opens to visitors 10 minutes before takeoff, at 09:50 UTC on December 24, and closes at 00:00 UTC on January 7. Advent opens at 00:00 UTC on November 30 and closes at the same January boundary. Outside those windows, public pages and APIs return 404. An authenticated admin can still preview them. For local or preview work, `SEASON_OVERRIDE=open` opens both features.

Advent day N unlocks at 12:00 UTC on December N. Day 1 is the Ornament Smash embed in `apps/web/public/advent/ornament-smash/`.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

See [the docs index](docs/README.md) for setup, configuration, architecture, deployment, and historical references.

## Deployment

The production Worker serves `https://santa.weatherboysuper.com`. Deployments run through `.github/workflows/deploy-cloudflare-workers.yml` on qualifying pushes to `main` or a manual workflow dispatch. See [docs/DEPLOY.md](docs/DEPLOY.md).
