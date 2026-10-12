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

## Automated pull request review

The Review | OCR workflow runs the OpenCode Code Review action with Muse Spark through the OpenCode Go Responses endpoint. It reviews each pull request update, posts inline findings and a sticky digest, and can be rerun by an authorized repository collaborator with the /ocr comment command. A workflow dispatch can also target a PR by number.

To enable reviews, add OPENCODE_API_KEY as a repository Actions secret. This is the same secret name used by the existing /oc workflow. The OCR workflow skips with a clear Actions summary while the secret is missing. The endpoint, model, and protocol can be overridden with repository variables OCR_LLM_URL, OCR_LLM_MODEL, and OCR_LLM_PROTOCOL.

The workflow uses pull_request_target so it can post review comments for fork PRs. The pinned review action checks out the trusted base and fetches the PR head as Git objects; it does not check out or execute the PR's files. Keep that boundary when changing the workflow.

During the evaluation period, the OCR check reports review failures and findings but is not a required status in the main-branch ruleset. The ruleset already blocks unresolved review threads. Add the OCR status check to the ruleset only after the reviewer has been evaluated and its findings should be a required merge gate.

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
