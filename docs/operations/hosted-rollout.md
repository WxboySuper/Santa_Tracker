# Hosted staging and production deployment

> The active procedure is [GFC delivery architecture](release-workflow.md).
> This page documents the VPS layout only; it no longer defines a beta → main
> promotion.

Ops companion to [timed-production-rollout.md](./timed-production-rollout.md).

## VPS layout

```text
/var/www/gfc/
  releases/<version>/
  current -> releases/<live-version>

/var/www/gfc-staging/
  releases/<version>/    # beta-mode build for smoke tests
  current -> releases/<staged-version>

/opt/gfc-analytics/
  releases/<version>/
  current -> releases/<live-version>
  config/production-release.json
  config/.env              # production analytics env (copied into release on promote)
  logs/

/opt/gfc-staging-analytics/   # beta-gated API on port 3008 for staging-gfc preview
  releases/<version>/         # separate copy from prod (not symlinked to gfc-analytics)
  current -> releases/<staged-version>
  config/.env                 # staging-only credentials (never prod .env)
  logs/
```

## One-time setup

1. Run `scripts/setup-vps.sh` on the production VPS (creates dirs + cron).
2. Point production nginx at `server/nginx.conf` (`root` = `/var/www/gfc/current`).
3. Enable `server/nginx-staging.conf` for `staging-gfc.weatherboysuper.com`.
4. Ensure GitHub secrets: `PROD_SSH_*`, `BETA_INVITE_PATH`, `BETA_INVITE_TOKEN` (staging uses same invite gate as beta).

## Optional timed rollout

`/etc/cron.d/gfc-rollout` runs every minute:

```bash
cd /opt/gfc-analytics/current && node release/check-rollout.mjs
```

Manual promote (after `rolloutAt` or emergency):

```bash
bash /opt/gfc-analytics/current/release/promote-release.sh
# or --force to ignore rolloutAt / already-live guard
```

## Current release author flow

1. Run **Deploy Staging** against the exact `main`, stable, or hotfix ref.
2. For production, merge the reviewed stable-line PR and run **Create Stable Release**.
3. The release event activates **Deploy Production to VPS**.

## Deployment feature config

Server-backed capability switches are reviewed in target deployment config files, not hard-coded in workflow env blocks:

- `deploy/beta-deployment-config.json` controls beta deploys and staging preview analytics.
- `deploy/production-deployment-config.json` controls production analytics.

The workflow definitions live on `main`, but each deploy checks out the release ref before reading these config files. To enable or disable a server-backed feature, update the config file on the branch/tag that will be deployed.

## Hotfix / emergency

Set `"action": "live"` in `deploy/production-release.json` for immediate full deploy (no staging).

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Deploy rejected | `node scripts/validate-production-release.mjs` locally; version vs `package.json` |
| Live updated early | `action` must be `stage`; verify `current` symlink on VPS |
| Staging 403 / beta gate | Sign in + beta access; use invite URL |
| Promote did not run | `config/status`, `rolloutAt`, `/opt/gfc-analytics/logs/rollout-cron.log` |
| `/updates` or `/updates/` returns **403** on direct URL | `public/updates/` exists for screenshots; nginx must use exact `location = /updates` blocks in `server/nginx.conf` (see repo). In-app NavLink/banner links work without this because React Router never requests the path from nginx. |
