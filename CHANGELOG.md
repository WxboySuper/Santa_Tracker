# Changelog — per-PR exhaustive (enforced in CI)

## [Unreleased] — Flask retirement #221

### Foundation — retire Flask runtime after parity acceptance

**Implements audit** https://plans.weatherboysuper.com/santa-tracker-flask-audit-217/ (inventory at 41c96a6) and issue #221 / tracker #199 / ADR 0001.

#### Added

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
- Workspace CI: `testing.yml` → Node 20/22 + pnpm + typecheck + lint + build + vitest; `linting.yml` → tsc + eslint + stylelint (no Python). `DEPLOYMENT.md` archived.
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
