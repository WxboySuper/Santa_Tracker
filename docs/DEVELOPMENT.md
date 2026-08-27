# Development guide

Santa Tracker runs as a Next.js application in a pnpm workspace. The Flask application and its Python dependencies are archived under `archive/flask-legacy` and are not part of the runtime.

## Prerequisites

- Node.js 20 or newer
- pnpm 9 or newer
- PostgreSQL 16 or newer for studio and publication flows

Install dependencies from the repository root:

```bash
corepack enable
pnpm install
```

### One-command local bootstrap

```bash
pnpm bootstrap
```

This checks for Node.js 22.13+, pnpm 10+, and Docker Desktop with Compose. It starts the PostgreSQL 16 service,
waits until `pg_isready` succeeds, and starts the Next.js dev server. The default connection string is
`postgresql://santa:santa@localhost:5432/santa_tracker`, matching `packages/config` and the Drizzle config.

The command works from PowerShell, Command Prompt, macOS, and Linux because it uses Node's process APIs instead of
shell-specific syntax. If a prerequisite is missing, it prints the install or startup action to take. To validate
the Node and pnpm path without starting Docker, use `pnpm bootstrap --check --skip-docker`. CI verifies the full
Docker prerequisite on Linux and the Node/pnpm path on Windows. macOS is not a supported CI target at this time.

To remove the local database volume and its data, run `docker compose down --volumes`.

### Next.js shell
## Run the app

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

### Database migrations

The `@santa-tracker/database` package owns PostgreSQL migrations. Generate a new migration after changing `src/schema.ts`, inspect the SQL, and commit the migration plus its `drizzle/meta` files:

```bash
pnpm --filter @santa-tracker/database db:generate
DATABASE_URL=postgresql://santa:santa@localhost:5432/santa_tracker \
  pnpm --filter @santa-tracker/database db:migrate
```

The `db:migrate` script calls the same `migrateDatabase` runner used by application code. CI runs the database integration tests in a separate PostgreSQL 16 job against `santa_tracker_test`, while the regular workspace checks do not need a database. The test clears only that database, applies all committed migrations twice, checks the resulting tables and columns, and verifies a failed migration leaves the prior schema usable. Local `pnpm test` skips these integration cases unless `DATABASE_URL_TEST` is set.

Each Drizzle migration runs in a transaction. If a statement fails, PostgreSQL rolls back that migration and leaves the last committed schema available. Do not disable transactional migration execution for production changes. Fix the migration, verify it against an empty test database, and rerun `db:migrate`. Never repair production by deleting rows from `__drizzle_migrations` or by editing an applied migration. For a change that needs data repair, add a new migration with an explicit rollback or recovery procedure.

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
