# Deployment

## Production Worker

The production site is `https://santa.weatherboysuper.com`. `apps/web` builds with vinext and deploys as the `santa-tracker` Cloudflare Worker. The Worker handles requests and uses the Cloudflare assets binding for built static files. Route and Advent snapshots use the `SANTA_SNAPSHOTS` R2 binding.

The deployment workflow is `.github/workflows/deploy-cloudflare-workers.yml`. It runs on pushes to `main` that touch the app, shared packages, publishing script, lockfile, or workflow. A manual dispatch is also available.

The workflow installs dependencies, publishes checked-in route and Advent snapshots to R2 without replacing existing active pointers, builds and deploys the Worker, syncs `SECRET_KEY` and `ADMIN_PASSWORD` from GitHub Actions secrets to Worker secrets, and runs `tools/smoke-test.mjs` against the production hostname using `SMOKE_ADMIN_PASSWORD`.

Manual dispatch can set `activate_dataset` to `advent-calendar` or `santa-route`. That opt-in step replaces that dataset's active R2 pointer after a successful build and deployment. Ordinary push deployments do not replace active pointers. The prior snapshot remains versioned in R2.

Required bindings and runtime variables are described in `apps/web/cloudflare.config.ts` and `apps/web/wrangler.toml`. The deploy workflow expects the `CLOUDFLARE_API_TOKEN`, `SECRET_KEY`, and `ADMIN_PASSWORD` GitHub Actions secrets. The R2 bucket is `santa-tracker-snapshots`.

## Local development

Local development uses the filesystem snapshot store under `apps/web/data/.versioned` by default. Use `SANTA_DATA_ROOT` to direct it to a temporary location.

**Never run `tools/santa-publish.mjs --remote`, `pnpm santa:publish:remote`, or other Wrangler write commands locally. This machine's Wrangler login can write to production R2.** Remote snapshot publishing belongs in the trusted deployment workflow.

## Legacy VPS workflows

The repo still contains `.github/workflows/deploy-on-release.yml` and `.github/workflows/first-deploy.yml`. They build or install a Node standalone app and deploy it to a VPS. This is a retired path; the Cloudflare Worker workflow is the production deployment path described here. Do not use the VPS workflows as current deployment instructions.

## Related records

- [ADR 0002: Cloudflare Workers hosting](adr/0002-cloudflare-workers-hosting.md) records the hosting decision.
- [ADR 0003: R2 snapshots](adr/0003-drop-postgres-r2-snapshots.md) records the removal of PostgreSQL.
- [Configuration](CONFIGURATION.md) lists the environment variables and bindings.
