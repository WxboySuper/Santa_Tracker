# Development guide

Santa Tracker runs as a Next.js application in a pnpm workspace. The Flask application and its Python dependencies are archived under `archive/flask-legacy` and are not part of the runtime.

## Prerequisites

- Node.js 22.13 or newer
- pnpm 10 or newer
- Docker Desktop with the Compose plugin and a running Docker engine

Install dependencies from the repository root:

```bash
corepack enable
pnpm install
```

### One-command local bootstrap

```bash
pnpm bootstrap
```

This checks for Node.js 22.13+ and pnpm 10+, then starts the Next.js dev server. No database or Docker is needed.

The command works from PowerShell, Command Prompt, macOS, and Linux because it uses Node's process APIs instead of
shell-specific syntax. If a prerequisite is missing, it prints the install action to take. To validate the toolchain
without starting the server, use `pnpm bootstrap --check`.

### Next.js shell

```bash
pnpm dev
```

Useful workspace commands:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:watch
pnpm build
```


### Legacy Flask (maintenance until parity)

The production build uses Next.js standalone output. The generated server is `apps/web/.next/standalone/server.js`.

## Tests and linting

Run all checks from the repository root:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Focused package checks are also available:

```bash
pnpm --filter @santa-tracker/contracts test
pnpm --filter @santa-tracker/route-engine test
pnpm --filter web exec vitest run src/lib/__tests__/parity.test.ts
```

GitHub Actions runs the workspace checks plus CSS, HTML, lockfile, dependency-rule, and security checks. The Python matrix and Python lint job only compile and lint the archived Flask files. They do not start Flask or validate a production path.

## Data and configuration

Copy `.env.example` to `.env` for local settings. The application reads route and Advent data from `apps/web/data/` by default. `SANTA_ROUTE_PATH` and `ADVENT_CALENDAR_PATH` can override those paths.

Data writes use temporary files and rename them into place. Each write also records a versioned snapshot in `.history/`.

## Project boundaries

- `apps/web` contains the Next.js application and route handlers.
- `packages/contracts` contains shared schemas.
- `packages/route-engine` contains pure route logic.
- `packages/config` contains typed configuration.
- `archive/flask-legacy` contains the retired Flask source and its maintenance-only checks.

### Public contract changes

`@santa-tracker/contracts` validates public route, snapshot, ID, and activity payloads. The current schema version is `2026.0.0`.

Snapshots require `snapshotId`, `author`, and `validationReport`. This is a breaking change for older snapshot files. Republish those files with the current version before serving them.

Use `parseRoute` and `parseSnapshot` at trust boundaries. Unsupported versions throw `ContractValidationError` with code `unsupported_schema_version`; malformed payloads use `invalid_input`.

Do not add runtime dependencies on files under `archive/`.

## Continuous integration

The workflows in `.github/workflows/` include:

- `workspace.yml` for typecheck, lint, test, build, and architecture rules.
- `linting.yml` for TypeScript, CSS, HTML, lockfile, and archive-only Python linting.
- `testing.yml` for the archive-only Python compatibility matrix.
- `deploy-on-release.yml` for the Node.js standalone deployment.

See [DEPLOY.md](DEPLOY.md) for the release and first-deployment procedures.
