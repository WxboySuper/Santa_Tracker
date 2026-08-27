# Changelog (per-PR, exhaustive)

This file is the exhaustive per-PR changelog required by `docs/planning/christmas-2026-reinvention.md` and the GitHub governance tracked in #330. Every PR must append an entry here. CI enforces presence of a new entry. A curated human highlights file may be added later; this file remains complete and machine-readable.

Format: `## [PR #] - YYYY-MM-DD - <type>(<scope>): <summary>`

## [Unreleased]

## [PR TBD] - 2026-08-27 - feat(foundation): add local stack bootstrap

- **Issue:** Fixes #219, the one-command local developer bootstrap.
- **Bootstrap:** Adds `pnpm bootstrap`, which checks Node.js, pnpm, and Docker Compose, starts PostgreSQL 16 with
  `docker-compose.yml`, waits for database readiness, and starts the Next.js dev server. `--check --skip-docker`
  supports CI and toolchain-only checks.
- **Docs and tests:** Documents Windows, macOS, Linux, and CI usage and tests the help and prerequisite paths.

## [PR #350] - 2026-08-21 - feat(foundation): scaffold Next.js pnpm workspace

- **Issue:** Closes #213 — [Foundation] Scaffold the Next.js pnpm workspace; parent tracker #199.
- **Workspace:** Adds `pnpm-workspace.yaml`, `pnpm-lock.yaml`, root `package.json` (`type: module`, `packageManager: pnpm@10.30.3`, `engines: node >=22.13, pnpm >=10`), `tsconfig.json` (strict, `noUncheckedIndexedAccess`), `eslint.config.js` (flat, strict TypeChecked for `**/*.{ts,tsx}` + `disableTypeChecked` for `**/*.js` legacy, Next + react-hooks + prettier, legacy JS still linted), `vitest.config.ts`, `.prettierrc.json`, and updated `.gitignore` (`next-env.d.ts`).
- **Apps:** `apps/web` — Next.js 15.5 App Router shell (`output: standalone` on Linux, dev-safe skip on Windows, `transpilePackages`, Tailwind 3.4, `src/app/layout.tsx` + `page.tsx` + `globals.css`) with dependency direction `web -> {activity-sdk, database, route-engine, ui, contracts, config}`.
- **Packages (explicit boundaries per ADR 0001):**
  - `@santa-tracker/contracts` — versioned Zod `Route`, `Snapshot`, `FeatureFlags` (with `FEATURE_FLAG_REGISTRY` governance: `adventEnabled`, `mapEnabled`, `weatherEnabled`, `soundscapeEnabled`), `SeasonMode`, `Coordinates` + stable branded IDs (`SCHEMA_VERSION = 2026.0.0`), tests 4.
  - `@santa-tracker/config` — typed `DATABASE_URL`, `SESSION_SECRET`, etc. validated once at process start with safe public projection, tests 4.
  - `@santa-tracker/route-engine` — pure `validateRoute` + `deriveJourneyState(now)` with injected clock, deterministic, tests 5 (refactored helpers for CodeScene health).
  - `@santa-tracker/ui` — `colors`, `radius`, `motion` tokens + `Button` a11y primitive (no data fetching), tests 1.
  - `@santa-tracker/activity-sdk` — lifecycle FSM `canTransition` / `assertTransition`, tests 2.
  - `@santa-tracker/database` — Drizzle `publications`, `locations`, `auditEvents` + `drizzle.config.ts`, tests 2 (migration/repo tests land in #210).
  - `@santa-tracker/test-fixtures` — `fixedClock`, `sequenceClock`, deterministic `Route`/`Snapshot` fixtures, tests 3.
- **Feature flags (governance):** Four scaffold flags (`adventEnabled` default false, `mapEnabled` true, `weatherEnabled` false, `soundscapeEnabled` false) registered in `FEATURE_FLAG_REGISTRY` with owner `foundation`, `status`/`exposure` `scaffold-only` (typed but **not yet wired** in `apps/web`; `apps/web/src/app/page.tsx:1` does not read `SeasonalConfig`), publication-validated in follow-ups. Disclosed in `README.md` flags table (now with Status column) and this changelog; changes require ADR. Follow-ups: #214 advent, #252 map, #253 weather.
- **Scripts (workspace):** `pnpm dev`, `pnpm build` (`pnpm -r build`), `pnpm typecheck` (`tsc --noEmit`), `pnpm lint` (`eslint . --max-warnings=0`, now lints both TS and legacy JS), `pnpm test` (`vitest run`), `pnpm test:coverage`. Fresh clone: `pnpm install` only (documented in README Quick Start and `docs/DEVELOPMENT.md`).
- **Evidence (local, Node 24.18 + pnpm 10.30):** `pnpm typecheck` ✓, `pnpm lint` ✓ (`.next`/`next-env.d.ts` ignored, legacy JS linted), `pnpm test` 22/22 pass, `pnpm build` ✓ (Next `Compiled successfully`, static `/` 102 kB), `stylelint` ✓ (legacy `prefers-contrast: high` and `rgba` now allowed via config). See PR body for logs and `pnpm install --frozen-lockfile` fresh-clone verification (`workspace.yml` job `Verify single-command install`).
- **Docs:** Updates `README.md` (pnpm Quick Start Node 22.13+, workspace structure, typed flags table, tech stack Node 22), `docs/DEVELOPMENT.md` (workspace workflows, dependency tables, CI simulation), this changelog.
- **CI:** Adds `.github/workflows/workspace.yml` (Node 22 + pnpm 10, typecheck/lint/test/build + ADR 0001 grep checks), updates `.github/workflows/linting.yml` to pnpm/Node 22 + `pnpm-lock.yaml` check, extends `.github/dependabot.yml` with npm/pnpm workspaces, fixes `.stylelintrc.json` (`media-feature-name-value-no-unknown`/`color-function-alias-notation` null for legacy).
- **Rollout/Migration:** No DB migration, no feature flag rollout in this PR (all 4 flags are `scaffold-only`, not yet wired; no visitor toggle). Legacy `src/`, `tests/`, `tools/route-editor` remain (legacy JS still linted via `disableTypeChecked`). Risk low; rollback via `git revert`. Build is `standalone` on Linux (VPS); Windows local build skips standalone to avoid EPERM.
