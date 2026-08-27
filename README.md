# 🎅 Santa Tracker — Next.js + TypeScript

[![Tests](https://img.shields.io/github/actions/workflow/status/WxboySuper/Santa_Tracker/testing.yml?branch=main&label=tests&style=flat-square)](https://github.com/WxboySuper/Santa_Tracker/actions)
[![Next.js](https://img.shields.io/badge/next.js-15-black?style=flat-square)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5-blue?style=flat-square)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

Track Santa's magical journey around the world on Christmas Eve — rebuilt as a single Next.js App Router application (TypeScript, pnpm workspace) per [ADR 0001](docs/adr/0001-application-architecture.md). Flask has been retired; see `archive/` for provenance.

## Features

- Interactive map (Leaflet) + countdown + tracker at `/tracker`
- Advent Village at `/advent` (gated by `ADVENT_ENABLED`, manifest + day APIs with server-authoritative unlock)
- Protected admin studio at `/admin` and `/admin/route-simulator` (JWT, no password bearer fallback, route group protected)
- Route CRUD, validation, import, simulation, trial lifecycle, backup export
- Advent editor (days, toggle-unlock, validate, export/import)
- PWA with curated offline fallback (`/offline`, `/sw.js` cache policy fixed vs Flask's `/index.html` split)
- Atomic JSON writes + versioned `.history/` snapshots, rollback via previous snapshot activation

## Quick Start

```bash
pnpm install
cp .env.example .env  # set ADMIN_PASSWORD + SECRET_KEY (min 16 chars)
pnpm dev              # http://localhost:3000
# production
pnpm --filter web build && pnpm --filter web start
```

Env: `SECRET_KEY`, `ADMIN_PASSWORD`, `ADVENT_ENABLED=True/False`, `LOG_LEVEL`, `JSON_LOGS`, `SANTA_ROUTE_PATH`, `ADVENT_CALENDAR_PATH`.

## Workspace

```
apps/web                 # Next.js public site, admin, APIs, jobs (standalone output)
packages/
  config/                # Typed env + validation (fail-closed in prod)
  contracts/             # Zod schemas + stable IDs
  route-engine/          # Pure validation/simulation/unlock (no Next/F S/clock)
  database/              # Drizzle placeholder (issue #210); filesystem store provides parity now
  ui/                    # Shared primitives
  activity-sdk/          # Activity lifecycle
  test-fixtures/         # Clocks, routes, snapshots
archive/
  flask-legacy/          # Retired src/app.py, config.py, utils, requirements
  route-data-2025-12-20/ # Snapshot of Route Data/ at audit commit 41c96a6
  DEPLOYMENT-flask-legacy.md
  offline-flask-legacy.html
```

Dependency direction per ADR: `web -> route-engine/contracts`, `database -> contracts/config`, etc. Flask and Python are not used by production or deploy paths. CI keeps archive-only Python checks for the retired implementation.

## API

- Public: `GET /api/advent/manifest`, `GET /api/advent/day/:day` (403 when locked with metadata)
- Admin (Bearer JWT, 24h HS256): `/api/admin/login` + all `…/locations`, `…/route/*`, `…/backup/export`, `…/advent/*`
- Health: `GET /api/health`
- Legacy: `GET /index` → 301 `/tracker`; `/admin/route-simulator-legacy` → 404; `/api/santa/*` documented but never implemented → retired

## Deploy

VPS (existing) — `Dockerfile` uses `output: standalone` (`node server.js`). See `docs/DEPLOY.md`. Legacy `docs/DEPLOYMENT.md` archived.

## Testing

```bash
pnpm --filter web exec vitest run   # parity tests (route-engine, advent, auth, no-Flask)
pnpm --filter web build             # 29 routes, 0 Flask imports
```

See `docs/ARCHITECTURE.md`, `docs/CONFIGURATION.md`, and audit: https://plans.weatherboysuper.com/santa-tracker-flask-audit-217/.

## Contributing

See `CONTRIBUTING.md` (updated for pnpm/Next). Past Flask instructions archived under `archive/`.

## License

MIT — `LICENSE`
