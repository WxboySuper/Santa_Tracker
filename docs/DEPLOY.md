# Deployment Guide — Next.js Standalone on VPS

This guide covers deploying the TypeScript Next.js application to the existing VPS with systemd and Nginx.

## Overview

- One deployable: Next.js `output: "standalone"` (`apps/web`)
- Node.js 20+ required, built artifact at `apps/web/.next/standalone/server.js`
- Release-based deploys via GitHub Actions (`deploy-on-release.yml` / `first-deploy.yml`)
- Health check at `/api/health`, readiness via same endpoint
- Data files at `apps/web/data/` (or fallback to `src/static/data/`), with atomic writes and `.history/` snapshots
- No Flask/Python runtime in production or deployment. CI retains archive-only Python checks for the retired source.

## File Ownership

```
/srv/santa-tracker/
├── releases/20251201-120000/   # owned by santa:santa
│   ├── server.js              # standalone output
│   ├── .next/static/
│   ├── public/
│   ├── data/                  # route + advent JSON (atomic writes)
│   └── .env (600)
├── current -> releases/...
└── data/                      # persistent if needed (chowned)
```

## Systemd Unit

`/etc/systemd/system/santa-tracker.service`:

```ini
[Unit]
Description=Santa Tracker Next.js
After=network.target

[Service]
Type=simple
User=santa
Group=santa
WorkingDirectory=/srv/santa-tracker/current
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/srv/santa-tracker/current/.env

[Install]
WantedBy=multi-user.target
```

Nginx proxies `http://127.0.0.1:3000`, serves `/public` via Next.

## GitHub Actions

Deploys build locally (`pnpm install && pnpm --filter web build` with `output: standalone`), uploads `standalone` + `public` + `.next/static`.

Health check after restart:

```bash
curl -f http://127.0.0.1:3000/api/health
```

## Environment

- `SECRET_KEY` — min 16 chars, used to sign JWT (HS256) admin tokens (24h expiry)
- `ADMIN_PASSWORD` — checked only at login, never accepted as bearer token (password fallback removed per audit)
- `ADVENT_ENABLED` — `True`/`False`
- `SANTA_ROUTE_PATH` / `ADVENT_CALENDAR_PATH` — optional overrides
- `LOG_LEVEL`, `JSON_LOGS` — typed in `packages/config`

## Legacy

- Flask artifacts archived under `archive/` (route data snapshot, offline HTML, DEPLOYMENT-flask-legacy.md, flask-legacy source)
- Python workflows only validate the archived source; see `archive/README.md`
- Service previously ran `venv/bin/python -m src.app` or `gunicorn src.app:app` — now retired

## Related

- ADR 0001: `docs/adr/0001-application-architecture.md`
- Audit: https://plans.weatherboysuper.com/santa-tracker-flask-audit-217/
- `docs/CONFIGURATION.md` for env details
- `archive/README.md` for provenance
