# Contributing to Santa Tracker

The live application is the Next.js workspace in `apps/web`. Flask/Python code in `src/` and `archive/` is retired and kept for reference or archival CI only.

## Local setup

Requirements are Node.js 22.13 or newer for bootstrap and pnpm 10 or newer. The root package declares Node.js 22.18+ as its engine range.

```sh
corepack enable
pnpm install
pnpm bootstrap
```

Bootstrap starts the app at `http://localhost:3000`. Copy `.env.example` only if you need local admin credentials or other local overrides. See [Configuration](docs/CONFIGURATION.md) for current variable names.

## Before opening a pull request

Run the workspace checks:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The GitHub workflows also run CSS, HTML, lockfile, dependency-rule, and UI Storybook checks. The linting workflow has JavaScript, CSS, HTML, and lockfile jobs, plus a separate Python job for the archived Flask source. Python checks do not validate the live app. `SECURITY_AND_SUPPLY_CHAIN.md` says the repository uses GitHub's default CodeQL setup, but the setup is managed outside the workflow files in this checkout. Review the checks on the pull request because branch protection settings are also managed by GitHub.

## Automated reviews

The OCR workflow reviews pull requests and publishes inline findings and a summary. It skips draft PRs, WIP/HOLD titles, and fork heads. The workflow fails its `ocr-review` gate when the review reports medium-or-higher findings. Resolve those findings and complete the review before merging. An authorized collaborator can request another run with `/ocr`.

The repo also contains configuration for CodeRabbit, CodeScene, and DeepSource. Those services are external integrations; their exact status requirements and label behavior are not defined by the application code here. Follow any review findings that appear on the PR. The checked-in CodeRabbit configuration has an empty `auto_review.labels` list, so this checkout does not verify a label-gated review rule.

## Making changes

1. Keep changes focused and add tests for behavior changes.
2. Update the relevant docs when commands, routes, configuration, or deployment behavior changes.
3. Update `CHANGELOG.md` for user-visible behavior changes.
4. Run the checks above and review automated findings.
5. Open a pull request with a short, descriptive title and a summary of the changes and verification.

Keep production code in the TypeScript workspace. Do not add runtime imports from `src/` or `archive/`.

## Documentation

See [the docs index](docs/README.md) for current guides and historical records.
