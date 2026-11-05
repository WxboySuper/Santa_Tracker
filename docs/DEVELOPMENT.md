# Development

The live app is in `apps/web`, a Next.js application in the pnpm workspace. The Flask/Python sources in `src/` and `archive/` are retired. Python CI checks archived files only.

## Requirements and setup

- Node.js 22.13 or newer for `pnpm bootstrap`.
- pnpm 10 or newer.

The root `package.json` declares Node.js 22.18 or newer as the workspace engine range. Use a Node version in that range for the supported workspace toolchain.

```sh
corepack enable
pnpm install
pnpm bootstrap
```

Bootstrap checks Node.js and pnpm, then starts `pnpm dev` at `http://localhost:3000`. Use `pnpm bootstrap --check` to check prerequisites without starting the server. You can also start the app directly with `pnpm dev`.

## Testing locally

The public Advent calendar is time-gated. To preview a specific unlocked day without changing checked-in data, give the local filesystem store a temporary root and open the seasonal gate:

```sh
SANTA_DATA_ROOT=./.tmp-advent SEASON_OVERRIDE=open pnpm dev
```

On PowerShell:

```powershell
$env:SANTA_DATA_ROOT = '.\.tmp-advent'
$env:SEASON_OVERRIDE = 'open'
pnpm dev
```

The checked-in Advent calendar sets day N to unlock at 12:00 UTC on December N. For other local data or the current calendar, use the admin tools to update the temporary store. `SANTA_DATA_ROOT` controls where the filesystem snapshot backend writes its `.versioned` directory.

**Never run `tools/santa-publish.mjs --remote` or any Wrangler write command locally. This machine's Wrangler login can write to production R2.** The publishing script's remote mode reads and writes the live bucket.

## Workspace commands

Run from the repository root:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm lint` runs ESLint. The workspace workflow also runs CSS, HTML, lockfile, dependency-rule, build, and UI Storybook checks. The separate Python lint and test workflows only inspect the archived Flask code.

Useful focused tests:

```sh
pnpm --filter @santa-tracker/contracts test
pnpm --filter @santa-tracker/route-engine test
pnpm --filter @santa-tracker/web test
```

## Data and package boundaries

Local checked-in data is in `apps/web/data/`. Snapshot writes go to the filesystem store under `apps/web/data/.versioned` by default; that directory is gitignored. `SANTA_DATA_ROOT` changes its root. Production uses the R2 `SANTA_SNAPSHOTS` binding.

`apps/web` is the composition root. Shared schemas live in `packages/contracts`, route and geometry logic in `packages/route-engine`, and shared UI, localization, configuration, and activity helpers live in their corresponding `packages/*` directories. Do not add runtime imports from `src/` or `archive/`.

## Continuous integration

`.github/workflows/workspace.yml` runs workspace typecheck, lint, tests, production build, dependency rules, and UI Storybook checks. `.github/workflows/linting.yml` contains separate Python archival, JavaScript, CSS, HTML, and lockfile jobs. `.github/workflows/testing.yml` compiles the archived Flask code across Python versions; it does not run the live app.

See [Contributing](../CONTRIBUTING.md) for pull request checks and review expectations, and [Deployment](DEPLOY.md) for production deploys.
