# Changelog (per-PR, exhaustive)

This file is the exhaustive per-PR changelog required by `docs/planning/christmas-2026-reinvention.md` and the GitHub governance tracked in #330. Every PR must append an entry here. CI enforces presence of a new entry. A curated human highlights file may be added later; this file remains complete and machine-readable.

Format: `## [PR #] - YYYY-MM-DD - <type>(<scope>): <summary>`

## [Unreleased]

## [PR #214] - 2026-08-21 - feat(workspace): scaffold Next.js pnpm workspace

- **Issue:** Closes #213 — [Foundation] Scaffold the Next.js pnpm workspace; parent tracker #199.
- **Workspace:** Adds `pnpm-workspace.yaml`, `pnpm-lock.yaml`, root `package.json` (`type: module`, `packageManager: pnpm@10.30.3`), `tsconfig.json` (strict, `noUncheckedIndexedAccess`), `eslint.config.js` (flat, strict TypeChecked + Next + react-hooks, prettier), `vitest.config.ts`, `.prettierrc.json`, and updated `.gitignore`.
- **Apps:** `apps/web` — Next.js 15.5 App Router shell (`output: standalone` on Linux, transpilePackages, Tailwind 3.4, `src/app/layout.tsx` + `page.tsx` + `globals.css`) with dependency direction `web -> {activity-sdk, database, route-engine, ui, contracts, config}`.
- **Packages (explicit boundaries per ADR 0001):**
  - `@santa-tracker/contracts` — versioned Zod `Route`, `Snapshot`, `FeatureFlags`, `SeasonMode`, `Coordinates` + stable branded IDs (`SCHEMA_VERSION = 2026.0.0`), tests 4.
  - `@santa-tracker/config` — typed `DATABASE_URL`, `SESSION_SECRET`, etc. validated once at process start with safe public projection, tests 4.
  - `@santa-tracker/route-engine` — pure `validateRoute` + `deriveJourneyState(now)` with injected clock, deterministic, tests 5.
  - `@santa-tracker/ui` — `colors`, `radius`, `motion` tokens + `Button` a11y primitive (no data fetching), tests 1.
  - `@santa-tracker/activity-sdk` — lifecycle FSM `canTransition` / `assertTransition`, tests 2.
  - `@santa-tracker/database` — Drizzle `publications`, `locations`, `auditEvents` + `drizzle.config.ts`, tests 2 (migration/repo tests land in #210).
  - `@santa-tracker/test-fixtures` — `fixedClock`, `sequenceClock`, deterministic `Route`/`Snapshot` fixtures, tests 3.
- **Scripts (workspace):** `pnpm dev`, `pnpm build` (`pnpm -r build`), `pnpm typecheck` (`tsc --noEmit`), `pnpm lint` (`eslint . --max-warnings=0`), `pnpm test` (`vitest run`), `pnpm test:coverage`. Fresh clone: `pnpm install` only (documented in README Quick Start and `docs/DEVELOPMENT.md`).
- **Evidence (local, Node 24.18 + pnpm 10.30):** `pnpm typecheck` ✓, `pnpm lint` ✓ (`.next` ignored), `pnpm test` 22/22 pass, `pnpm build` ✓ (Next `Compiled successfully`, static `/` 102 kB). See PR body for logs and `pnpm install --frozen-lockfile` fresh-clone verification (`workspace.yml` job `Verify single-command install`).
- **Docs:** Updates `README.md` (pnpm Quick Start, workspace structure, tech stack, testing matrix), `docs/DEVELOPMENT.md` (workspace workflows, dependency tables, CI simulation), this changelog.
- **CI:** Adds `.github/workflows/workspace.yml` (typecheck/lint/test/build + ADR 0001 dependency-rule grep checks), updates `.github/workflows/linting.yml` to pnpm/Node 20 + `pnpm-lock.yaml` check, extends `.github/dependabot.yml` with npm/pnpm workspaces.
- **Rollout/Migration:** No DB migration. Legacy `src/`, `tests/`, `tools/route-editor` remain npm-isolated and untouched. No feature flags. Risk low; rollback via `git revert`. Build is `standalone` on Linux (VPS); Windows local build skips standalone to avoid EPERM symlink privilege.
