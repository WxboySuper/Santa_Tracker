# Release workflow

Your normal flow stays simple: **open a PR, review it, click merge**. Automation handles versions, changelog gates, labels, and **GitHub Releases for every `package.json` version change** (stable tags on `main`, prerelease tags on `beta`).

## Your day-to-day (short answer)

| Goal | What you do |
|------|-------------|
| Feature work | Prefer `feature/*` or `fix/*` → PR into **beta** → merge (other branch names are allowed except `hotfix/*`) |
| Promote to production | PR **beta → main** → merge (nothing else required) |
| Production hotfix | Branch `hotfix/*` → PR into **main** → merge (GitHub Release created automatically) |

After merge, **Post-merge automation** runs on its own (no Actions button).

## Stable fixes forward-port into main

When a reviewed PR merges into a `stable/X.Y.x` branch, the
`Forward-port Stable Fix` workflow prepares a normal draft PR from the stable
merge into `main`. It applies the trusted merge commit's diff to the current
`main` branch; it never checks out or executes code from the original PR head,
and it never merges the port automatically.

If the diff applies cleanly, review the generated `port/<pr>-to-main` PR like
any other change. If the architectures have diverged, the workflow creates a
`porting/conflicts` issue instead. Re-express the stable behavior manually on
`main`, then include `Changelog-Impact: inherited` and `Port of #<stable-pr>`
when the stable changelog entry is carried forward.

## Porting vs post-merge (do not double up)

Two automations run on merged PRs; they are split on purpose:

| Responsibility | Workflow | Mechanism |
|----------------|----------|-----------|
| **Versions and GitHub Releases** on `main` / `beta` | `post-merge-automation.yml` | Direct commits to `main` or `beta` |
| **main → beta sync** after promotion, `release/*`, or `feature/release-*` | `post-merge-automation.yml` | Merge/bump on `beta` (no port PR) |
| **hotfix → beta** (and other main merges not owned by post-merge) | `pr-porting.yml` | Single port PR into `beta` |

If both tried to port the same merge into `beta`, you would get a port PR and a CI push fighting each other. **PR porting skips `beta`** when post-merge already owns that sync. CI **fails** redundant `port/* → beta` PRs that duplicate that path.

### Skipping automated ports

- Add **`porting/manual`** to the source PR on `main` before merge to block automation entirely.
- Or open a manual **`your-branch → beta`** PR first (same head branch or body referencing `#<sourcePr>`); automation detects it and skips.

### Conflicts

Automation auto-resolves version-policy file conflicts on beta ports (`package.json`, lockfiles, `CHANGELOG.md`, `deploy/production-release.json`). Remaining code conflicts open a **draft** `[Port][Conflicts]` PR — no tracking issue. See [`AGENTS.md`](../AGENTS.md) for manual port steps.

## What happens when you merge

### beta → main (promotion)

1. You merge the **beta → main** PR (same as today).
2. **Post-merge automation** (`post-merge-automation.yml`):
   - Strips `-beta` from `package.json` on `main` (e.g. `1.6.0-beta.3` → `1.6.0`) and pushes.
   - Creates a **GitHub Release** `v1.6.0` using the matching section in `CHANGELOG.md`.
   - Bumps **beta** to the next line (e.g. `1.7.0-beta.1`) and creates a **prerelease** `v1.7.0-beta.1`.
3. **Deploy Production to VPS** runs when the stable GitHub Release is published (checks out tag `v1.6.0`, so the build matches the released version).
4. **Deploy Beta** runs when the new beta prerelease is published (e.g. `v1.7.0-beta.1`).

### release/* → main (optional prepare workflow)

Same outcome as direct **beta → main**, but via a `release/vX.Y.Z` branch from **Prepare Beta → Main Release PR**:

1. Merge the release PR to `main`.
2. **Post-merge automation** merges **main** into **beta** (so beta always has the same code), creates the **stable GitHub Release**, and bumps **beta** using the **pre-merge** beta version (merge must not overwrite `package.json` before the bump script runs). When `main` is still on an older stable line, beta keeps its current prerelease; otherwise beta moves to the next line and publishes a **prerelease**.

Infrastructure fixes that land via `release/*` → `main` (not only `feature/release-*`) use the same **main → beta** merge; version-only bumps are not enough.

### Integrations → beta

- Preferred: `feature/*` and `fix/*` (labeled `integration:primary`).
- Other branch names are allowed into beta except `hotfix/*` (labeled `integration:other`).
- Automation increments the beta prerelease on each merge: `1.6.0-beta.1` → `1.6.0-beta.2`, etc.
- Each bump creates a **GitHub prerelease** (`v1.6.0-beta.2`) from the matching `CHANGELOG.md` line section, or from **\[Unreleased\]** when no line section exists yet.
- **Deploy Beta** runs when that prerelease is published (not on the merge or version-bump pushes).
- Port branches (`port/*`) skip the version bump.

### hotfix/* → main

- Automation bumps the **patch** on `main` after merge (e.g. `1.6.0` → `1.6.1`).
- Creates a **GitHub Release** for the new patch version from `CHANGELOG.md`.
- **Deploy Production to VPS** runs when that stable release is published.

### `feature/release-*` → main (release infrastructure)

- Merges **main** into **beta** so beta gets workflows/scripts.
- Creates the **stable GitHub Release** for the version on `main` (e.g. `v1.5.3`) if it is missing.
- **Does not reset** an in-progress beta line when `main` is still on an older stable (e.g. main `1.5.3` while beta is `1.6.0-beta.N` stays on `1.6.0-beta.N`).
- Only starts a **new** `X.Y.0-beta.1` line after a **beta → main** promotion (or when `main` stable matches the line beta was building).
- Does **not** change `main` again (the PR already set the stable version).

If you merged release automation before this step existed, run **Post-merge automation** manually (`workflow_dispatch`, enable **sync beta from main**) to backfill the stable release and start the beta line.

## Branch rules (enforced in CI)

| Head branch | Base branch | Allowed |
|-------------|-------------|---------|
| `feature/*` | `beta` | Yes (preferred) |
| `fix/*` | `beta` | Yes (preferred) |
| Other names (not `hotfix/*`) | `beta` | Yes |
| `hotfix/*` | `main` | Yes |
| `beta` | `main` | Yes (promotion) |
| `feature/release-*` | `main` | Yes (release infrastructure) |
| `feature/*`, `fix/*`, other | `main` | **Blocked** |
| `hotfix/*` | `beta` | **Blocked** |

`main` and `beta` are protected; direct pushes are already restricted.

## Version policy

| Branch | `package.json` |
|--------|----------------|
| `beta` | Must include `-beta.N` (e.g. `1.6.0-beta.2`) |
| `main` | Stable semver only (e.g. `1.6.0`) |
| PR **beta → main** | May show `-beta` on the PR; stripped automatically after merge |

## Dependabot

Version update PRs from `.github/dependabot.yml` open against **beta** (root and `server/`). They ride the normal integration and **beta → main** promotion path. For an urgent CVE on production before the next promotion, use **hotfix/* → main** (or merge the dependency fix to `main` manually) instead of waiting on Dependabot alone.

### Dependabot changelog automation

- **Dependabot changelog** workflow (`dependabot-changelog.yml`) lives on **`main`** (required for GitHub Actions to run it). After it ships, it runs on each Dependabot PR targeting `beta` and commits bullets under **`### Dependencies`** in the active changelog section (`## [Unreleased]` on `main`, or the top `## vX.Y` line on `beta` once synced).
- CI requires `CHANGELOG.md` to include those entries (not a generic changelog skip). Entries use the form `- **package:** old → new` with `(\`server\`)` when the bump is under `server/package.json`.
- Dependency notes accumulate under **Dependencies** until the next **beta → main** promotion ships them in the stable GitHub Release for that line.

## Changelog

For PRs into **beta** (feature/fix) and **hotfix → main**:

- Edit `CHANGELOG.md` in the PR, **or**
- Add a `## Changelog` section with bullets in the PR description.

**beta → main** promotion PRs skip the file check (verify the release section in CHANGELOG before merge).

## PR labels (automatic)

`pr-governance.yml` applies labels on every PR update:

**Routing / integration:** `promotion`, `feature`, `fix`, `hotfix`, `release`, `port`, `integration:primary`, `integration:other`

**What changed:** `Documentation`, `Enhancement`, `Bug`, `javascript`, `dependencies`, `quality`, `e2e-validated`, `porting`, and `Component: Map|Outlooks|Drawing-Tools|Export|UI|Storage` (from the file diff)

**Status:** `has conflicts`, `draft`, `ci:pending`, `ci:passing`, `ci:failing`, `changelog:ok`, `changelog:missing`

Labels are created in the repo if missing; only automation-managed labels are refreshed each run (manual labels you add are left alone).

## Optional / legacy workflows

| Workflow | When to use |
|----------|-------------|
| **Prepare Beta → Main Release PR** | Optional alternate path using `release/v*` branches (not required if you use beta → main PR). |
| **Bump beta for next development cycle** | Manual override if post-merge bump did not run. |
| **(Legacy) Direct promote beta → main** | Emergency only (`LEGACY-DIRECT-PROMOTE`); bypasses PR review. |

## Required secret

- **GH_PAT** — same token as PR porting (`repo` scope), used for post-merge commits and releases.

## Local scripts

| Script | Purpose |
|--------|---------|
| `node scripts/validate-branch-policy.mjs` | Branch routing check |
| `node scripts/validate-package-version.mjs` | Version policy check |
| `node scripts/check-changelog-pr.mjs` | Changelog check |
| `node --test scripts/lib/package-version.test.mjs` | Policy unit tests |
