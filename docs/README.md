# Documentation index

`Current` marks a guide checked against the app and workflow configuration. `Historical` marks a decision record, old specification, or guide that may describe retired behavior. Historical documents remain available for context; use current guides for operating the app.

## Current guides

| Document | What it covers |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | App runtime, snapshot storage, season access, and workspace packages. |
| [Configuration](CONFIGURATION.md) | Runtime and tool environment variables, defaults, and secret handling. |
| [Development](DEVELOPMENT.md) | Local setup, temporary Advent preview data, and workspace checks. |
| [Deployment](DEPLOY.md) | Cloudflare Worker deploy workflow and the retired VPS path. |
| [Activity SDK](ACTIVITY_SDK.md) | Contracts and helpers provided by the Advent activity SDK. |
| [Localization](LOCALIZATION.md) | Locale selection and translation helpers in the app. |
| [UI Storybook](UI_STORYBOOK.md) | Shared UI package Storybook setup and visual checks. |
| [Contributing](../CONTRIBUTING.md) | Pull request checks and automated review expectations. |

## Historical or needs review

| Document | Status and description |
| --- | --- |
| [Admin dashboard](ADMIN_DASHBOARD.md) | Needs review. Dashboard overview predates the current app and APIs. |
| [Admin security review](ADMIN_SECURITY_REVIEW.md) | Historical security review for a specific pull request. |
| [Advent calendar API](ADVENT_CALENDAR_API.md) | Needs review. Advent API notes include legacy examples; verify behavior against the implementation. |
| [API](API.md) | Needs review. Verify endpoint details against the current route handlers. |
| [Cinematic logic spec](cinematic_logic_spec.md) | Historical design specification. |
| [Countdown timer](COUNTDOWN_TIMER.md) | Needs review. Feature notes may predate the current UI. |
| [Route editor algorithm](editor_algorithm_logic.md) | Needs review. Verify the described status rules against the current editor. |
| [Security and supply chain](SECURITY_AND_SUPPLY_CHAIN.md) | Needs review. Verify workflow and CodeQL status against current GitHub settings. |
| [ADR 0001: Application architecture](adr/0001-application-architecture.md) | Historical architecture decision; its PostgreSQL and Flask sections are superseded. |
| [ADR 0002: Cloudflare Workers hosting](adr/0002-cloudflare-workers-hosting.md) | Historical record of the hosting decision. |
| [ADR 0003: Drop PostgreSQL](adr/0003-drop-postgres-r2-snapshots.md) | Historical record of the snapshot storage decision. |
| [Christmas 2026 reinvention plan](planning/christmas-2026-reinvention.md) | Historical planning draft; check current code and workflows for project status. |

## Related records outside `docs/`

- [Archived Flask implementation](../archive/README.md) describes the retired code and its archival checks.
- [Repository overview](../README.md) has a short current project summary and local start instructions.
