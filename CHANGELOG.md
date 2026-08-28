# Changelog — per-PR exhaustive (enforced in CI)

## [PR #] - 2026-08-28 - feat(ui): add Storybook design baseline

- **Issue:** Closes #216, establishing the first shared UI baseline for the Christmas 2026 redesign.
- **Tokens:** Adds color, typography, spacing, layer, motion, focus, radius, and seasonal-state tokens, including CSS overrides for reduced motion and high contrast.
- **Stories:** Adds Button variants and a seasonal token gallery with mobile, high-contrast, and reduced-motion toolbar states.
- **Checks:** Adds Storybook build, axe accessibility, and per-story PNG screenshot checks to the workspace CI job.
- **Docs:** Adds `docs/UI_STORYBOOK.md` with local and CI-style commands.

## [Unreleased] — Shared public contracts (#211)

- Added validated public ID schemas and constructors for locations, publications, snapshots, and activities.
- Added versioned route and snapshot contracts with publication metadata, checksums, timestamps, and typed version errors.
- Added deterministic snapshot metadata and consumed the fixture from the web contract test.
- Breaking contract change: snapshots now require `snapshotId`, `author`, and `validationReport`; old snapshot payloads must be republished with the current schema version.

## [Unreleased] — Flask retirement #221

## [Unreleased] — Migration fixtures #218

- Added shared Zod schemas and deeply frozen fixtures for all 185 nodes in the 2025 route and all 24 Advent days.
- The migration schema records two source exceptions without rewriting the fixture: unwrapped longitudes up to 360 degrees and legacy IDs containing repeated underscores. Runtime normalization still applies the canonical coordinate and ID rules.
- Published SHA-256 values in the fixture module make accidental source drift visible in tests. Legacy Advent payloads stay intentionally open-ended because the copied source uses different shapes by content type; a later content contract can tighten those fields without rewriting this provenance fixture.
- Removed the Next.js resolver's fallback to retired Flask data, so the new runtime has one route and Advent data source.
- Removed the remaining Next.js trial-route fallback to `src/static/data`; trial data now stays under the new app data directory.

### Foundation — retire Flask runtime after parity acceptance

**Implements audit** https://plans.weatherboysuper.com/santa-tracker-flask-audit-217/ (inventory at 41c96a6) and issue #221 / tracker #199 / ADR 0001.

#### Added

## [PR #346] - 2026-08-25 - fix(public): harden Next.js public surfaces

- **Security:** Replaced Advent client-side `innerHTML` rendering with server-rendered React elements, so calendar data is escaped before it reaches the DOM.
- **Consistency:** Unified the Advent feature flag and countdown behavior through shared helpers/components; moved Leaflet CSS to the tracker surface only.
- **Reliability:** Made Advent and route status metadata reads asynchronous, made the health endpoint explicitly dynamic, and derived legacy `/index` redirects from the incoming request origin.
- **Offline behavior:** Added cache-first handling for OpenStreetMap tiles and normalized `/api/route` cache keys in the service worker.
- **Public API exposure review:** `/api/route`, `/api/health`, and `/api/advent/*` are intentionally unauthenticated public endpoints. They expose route/health data and feature-gated Advent metadata only; no admin mutation or secret-bearing data is exposed. The Advent API withholds locked payloads server-side. See `docs/API.md`.
- **Evidence:** Typecheck ✓, lint ✓, 35 workspace tests ✓, production Next.js build ✓, service-worker syntax check ✓.

## [PR #370] - 2026-08-27 - feat(foundation): add local stack bootstrap

- **Issue:** Fixes #219, the one-command local developer bootstrap.
- **Bootstrap:** Adds `pnpm bootstrap`, which checks Node.js, pnpm, and Docker Compose, starts PostgreSQL 16 with
  `docker-compose.yml`, waits for database readiness, and starts the Next.js dev server. `--check --skip-docker`
  supports CI and toolchain-only checks.
- **CI:** Adds explicit Linux bootstrap coverage that starts the compose PostgreSQL service and waits for readiness,
  alongside the Windows prerequisite-path job. macOS is not included in the CI matrix.
- **Docs and tests:** Documents Windows, macOS, Linux, and CI usage and tests the help and prerequisite paths.

## [PR #350] - 2026-08-21 - feat(foundation): scaffold Next.js pnpm workspace

- pnpm workspace (`pnpm-workspace.yaml`, root `package.json` workspaces) with `apps/web` (Next.js 15 App Router, TypeScript, Tailwind, `output: standalone`) and packages `config`, `contracts`, `route-engine`, `database`, `ui`, `activity-sdk`, `test-fixtures` per ADR dependency rules.
- TypeScript domain ports: `apps/web/src/lib/locations.ts`, `advent.ts`, `route-sim.ts`, `auth.ts`, `config.ts` + pure `packages/route-engine` and `packages/contracts` (Zod). No `itsdangerous` password fallback — JWT HS256 24h only.
- Public pages: `/` (home), `/tracker`, `/advent` (gated by `ADVENT_ENABLED`), `GET /index` → 301 `/tracker` (archive disposition), `/offline` + `public/sw.js` (fixed cache list, no `/index.html` split), `public/offline.html` compat.
- Protected admin: `/admin`, `/admin/route-simulator` (client login → JWT → cookie `admin_token`, middleware verifies HS256, `x-admin-auth` header, no page shell without token). Legacy `/admin/route-simulator-legacy` → 404 (Retire).
- Public APIs: `GET /api/advent/manifest`, `GET /api/advent/day/:day` (403 metadata when locked, server-authoritative), `GET /api/health`.
- Admin APIs (Bearer JWT, all under `requireAdminAuth`): `POST /api/admin/login`, `GET/POST /api/admin/locations`, `PUT/DELETE /api/admin/locations/:id`, `POST /api/admin/locations/validate`, `POST /api/admin/locations/import`, `GET /api/admin/route/status`, `POST /api/admin/route/precompute` (validation), `POST /api/admin/route/simulate`, `GET/POST/DELETE /api/admin/route/trial`, `POST /api/admin/route/trial/apply`, `POST /api/admin/route/trial/simulate`, `GET /api/admin/backup/export`, `GET /api/admin/advent/days`, `GET/PUT /api/admin/advent/day/:day`, `POST /api/admin/advent/day/:day/toggle-unlock`, `POST /api/admin/advent/validate`, `GET /api/admin/advent/export`, `POST /api/admin/advent/import`.
- Deployment: `Dockerfile` (standalone), updated `deploy-on-release.yml` / `first-deploy.yml` to Node (no venv/pip), `docs/DEPLOY.md` rewritten for `node server.js` + `/api/health` probe.
- Data: atomic writes (`.tmp` → `rename`) + versioned `.history/` snapshots (last 5) for both route and advent, rollback via activating previous snapshot. `apps/web/data/` + `public/data/` + fallback to legacy `src/static/data/` (no competing `Route Data/` reads). `archive/route-data-2025-12-20/` snapshot, `archive/offline-flask-legacy.html`, `archive/flask-legacy/` (app.py, config.py, utils, requirements, pyproject).
- Security fixes: removed `ADMIN_PASSWORD` bearer fallback, admin page boundary now protected in `middleware.ts` (not just API decorator), config fail-closed in production (`packages/config`), `SECRET_KEY` placeholder detection retained.
- PWA: `POST /sw.js` uses `/offline` and `/data/santa_route.json` (not stale `/src/static/...`), CDN `isExternalUrl` kept, cache version `next-v1`.
- Workspace CI: `testing.yml` → archive-only Python compatibility matrix; `workspace.yml` → Node + pnpm + typecheck + lint + build + vitest; `linting.yml` → tsc + eslint + stylelint plus archive-only Python lint. `DEPLOYMENT.md` archived.
- Tests: `apps/web/src/lib/__tests__/parity.test.ts` (13 parity checks: normalization, validation, simulation sort, advent unlock, JWT vs password fallback, no-Flask).

#### Changed

- `next.config.ts`: `standalone` (Linux), `transpilePackages`, redirects for `/index` + `/index.html`, rewrites for `/static/data/*` compat.
- `.env.example`: Node keys (`ADMIN_PASSWORD`, `SECRET_KEY`, `ADVENT_ENABLED`).
- `.gitignore`: Node/Next ignores + `.history/` + trial files.
- `README.md`, `CONTRIBUTING.md`: Node/pnpm instructions.

#### Retired

- Flask runtime: `src/app.py`, `config.py`, `src/utils/locations.py`, `src/utils/advent.py`, `src/utils/tracker.py`, `src/logging_config.py`, `requirements.txt`, `requirements-dev.txt`, `pyproject.toml`, `.coveragerc`, `.flake8`, root `sw.js` + `offline.html` (now in `apps/web/public`), `tools/route-editor` remains but not deployed (Replace disposition), undocumented `/api/santa/*` not ported.

#### Migration notes

- `SEC
RET_KEY` must be ≥16 chars; set via `PROD_DOTENV` on VPS (`.env` mode 600).
- After deploy, verify `GET /api/health` and `current` symlink ownership per `DEPLOY.md`.
- Historical `Route Data/` remains under `archive/` for provenance; new runtime does not read it.

## [Unreleased] - Localization-ready boundaries (#220)

- Added typed localization with English fallback and visible missing-key behavior.
- Routed public UI messages through the localization layer.
- Added localized content contracts and tests. See `docs/LOCALIZATION.md`.

## [PR #368] - 2026-08-27 - feat(migrations): establish postgres migration workflow

- **Database:** Adds the initial Drizzle SQL migration and metadata for the publications, locations, and audit events tables.
- **Workflow:** Adds a reusable migration runner, an isolated PostgreSQL integration test, and a PostgreSQL 16 CI service. The test applies migrations to an empty database and runs it a second time to verify repeatability.
- **Documentation:** Documents local migration commands and the transactional failure and rollback behavior used for production migrations.
