# Contributing to Santa Tracker

Santa Tracker is a Next.js application in a pnpm workspace. The former Flask application is kept under `archive/flask-legacy` for reference and migration checks. It is not a development or production runtime.

## Prerequisites

- Node.js 20 or newer
- pnpm 9 or newer, installed with Corepack or `npm install --global pnpm`
- Git
- A modern browser

PostgreSQL 16 or newer is optional for studio and publication flows.

## Local setup

```bash
git clone https://github.com/WxboySuper/Santa_Tracker.git
cd Santa_Tracker
corepack enable
pnpm install
cp .env.example .env
```

Edit `.env` before using authenticated routes. Never commit that file.

Start the application at `http://localhost:3000`:

```bash
pnpm dev
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Yes for admin login | Password checked during login |
| `SECRET_KEY` | Yes in production | Secret used to sign admin JWTs |
| `ADVENT_ENABLED` | No | Set to `true` to enable Advent routes |
| `SANTA_ROUTE_PATH` | No | Optional route-data file override |
| `ADVENT_CALENDAR_PATH` | No | Optional Advent-data file override |
| `LOG_LEVEL` | No | Application log level |
| `JSON_LOGS` | No | Set to `true` for structured logs |

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for the complete configuration reference.

## Checks before opening a pull request

Run the same core checks used by the workspace workflow:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The repository also runs CSS, HTML, lockfile, dependency-rule, and security checks in GitHub Actions. The Python workflow only validates files under `archive/flask-legacy`; it does not run the application.

## Making changes

1. Create a focused branch.
2. Add or update tests for behavior changes.
3. Update `CHANGELOG.md` for every pull request.
4. Update the relevant documentation when commands, routes, configuration, or deployment behavior changes.
5. Run the local checks above.
6. Commit with a short, descriptive message and open a pull request.

Keep production code in the TypeScript workspace. Do not add new runtime imports from the archived Flask application.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)
- [Configuration](docs/CONFIGURATION.md)
- [API](docs/API.md)
- [Deployment](docs/DEPLOY.md)
- [Legacy archive](archive/README.md)
