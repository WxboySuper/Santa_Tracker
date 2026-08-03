# AGENTS.md

## Operating Mode

This repo uses an agentic development workflow: inspect the codebase, make the smallest coherent change, verify it, and leave the workspace in a state a human can immediately continue from.

Agents should act like senior collaborators, not script runners. Prefer concrete progress over long proposals. When the user asks for an implementation, implement it. When the user reports a UI issue with screenshots, iterate directly against the actual behavior and verify the result.

## Core Principles

- Read the relevant code before changing it.
- Follow existing patterns before introducing new abstractions.
- Keep changes scoped to the requested behavior.
- Preserve unrelated worktree changes.
- Do not revert, reset, delete, or overwrite work you did not create unless explicitly asked.
- Prefer clear, testable fixes over broad rewrites.
- Make UI changes with the real user workflow in mind, not just the component in isolation.
- Treat mobile and responsive behavior as first-class product behavior.

## Git Rules

- Make code changes on a branch based on `beta` unless the user specifies another base or the workspace is already on a fresh task branch.
- If the current branch is not suitable for the requested change, create a new branch from `beta` before editing.
- Do not implement on `beta` (or `main`) in place when the work is a discrete fix or feature—check out a new task branch first (for example `fix/sentry-gfc-web-7-short-description`).
- For production bug fixes, Sentry investigations, and other shippable repairs: use a dedicated branch, commit there, push, and open a pull request targeting `beta` when the fix is complete and verified—unless the user explicitly asks to stay local-only.
- Do not commit unless the user asks.
- Do not push unless the user asks.
- Do not open a pull request unless the user asks.
- It is fine to inspect git status and diffs while working.

## Implementation Workflow

1. **Investigate the task/issue relative to the codebase on the correct branch relative to the issue or task**
   - Understand the problem scope
   - Explore relevant code and existing tests
   - Determine the correct branch (main or beta based on task type)

2. **Create a plan for implementation to resolve the issue or complete the task**
   - Document the approach
   - Define expected changes
   - Outline testing strategy

3. **Get approval for that plan**
   - Share the plan with the human for review and approval
   - Incorporate feedback

4. **Implement that plan on a NEW branch from either main or beta depending on the issue/task**
   - Create a dedicated branch for this task
   - Use the approved plan as the implementation guide
   - Follow coding standards and existing patterns

5. **Commit and push the changes and open a Draft PR**
   - Make focused, minimal commits
   - Push to the new branch
   - Create a draft PR for review

6. **Wait on CI, make sure it is all green. All will run except Greptile**
   - Wait for CI to complete
   - Ensure all checks pass (except Greptile)
   - Resolve any non-Greptile CI failures

7. **Mark the PR Ready for Review and wait on Greptile to run and get it green and resolve all of its comments**
   - Mark PR as "Ready for Review"
   - Wait for Greptile to run
   - Address all Greptile comments and ensure it passes

8. **Once Greptile and CI are green stop and hand off to the human to manually review and handle the rest of the process**
   - Final verification that both CI and Greptile pass
   - Stop automated work
   - Hand off to human for final review and any additional manual steps

If a test fails, fix the product code or the test based on the intended behavior. Do not weaken coverage just to make CI pass.

New feature work should include reasonable test coverage for the behavior that is easily testable. Keep changed files above 80% coverage, preferably higher when the code is important or easy to exercise.

## Frontend Expectations

- Build the actual usable experience, not a placeholder or marketing surface.
- Validate responsive layouts at realistic viewport sizes.
- For forecast editor work, verify both portrait and landscape phone layouts.
- Avoid horizontal page overflow.
- Avoid controls that require both vertical and horizontal scrolling in the same toolbar surface.
- Keep map workspace usable and visible on mobile.
- Keep touch targets large enough for phone use.
- Prefer CSS and existing component architecture before introducing mobile-only duplicates.
- If screenshots show overlap, clipping, unreachable controls, or awkward placement, treat that as a product bug.

## Forecast Editor Notes

The forecast editor is the highest-priority workflow. The map should remain the primary workspace, with toolbar controls adapting around it.

For mobile work, check:

- Navbar does not overflow.
- Map remains visible and usable.
- Floating map controls do not collide with the toolbar, legend, credits, or warning badge.
- Bottom toolbar tabs are reachable.
- Draw, Days, Layers, and Tools controls remain accessible.
- Legend/key can be hidden by default and opened intentionally.
- Landscape phone layout uses the mobile interaction model when height is constrained.

## Testing Guidance

Use the narrowest useful verification first, then broaden as risk increases.

Coverage matters. When adding features, update or add tests in the same change so behavior is protected and file coverage stays above 80%.

Common focused unit test command:

```powershell
pnpm test -- --runTestsByPath <test-file-1> <test-file-2>
```

Common build command:

```powershell
pnpm run build
```

Common Playwright command:

```powershell
pnpm exec playwright test e2e/smoke.spec.ts
```

When testing against an already-running local dev server:

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3001'
$env:PLAYWRIGHT_SKIP_WEBSERVER='1'
pnpm exec playwright test e2e/smoke.spec.ts
```

## Communication

- Keep updates short and concrete while working.
- Tell the user what you changed and what passed.
- Call out any verification that could not be run.
- Mention unrelated dirty files only when they matter.
- Do not bury the result under process narration.

## GitHub PR and issue bodies

When writing or updating PR descriptions, issue comments, or `gh pr create` / `gh pr edit` bodies:

- Use real Markdown backticks for inline code: `` `ci.yml` ``, `` `$GITHUB_HEAD_REF` ``, `` `main` ``.
- Never escape backticks for the shell (`\``) inside PR/issue bodies — that renders as garbage on GitHub.
- On Windows/PowerShell, prefer `gh pr edit <n> --body-file path/to/body.md` (or a here-string written to a temp file) instead of passing `--body` with nested quotes and backticks on the command line.
- Use normal Markdown structure: `##` headings, `- [ ]` checklists, and fenced code blocks only for multi-line snippets.
- File paths and branch names belong in backticks; issue/PR references use `#123` without backticks.

## Porting main → beta

Use this when you need to land a **main** change on **beta** yourself, or when automated porting opened a draft conflict PR.

### When automation runs

| Merge | What happens |
|-------|----------------|
| `hotfix/*` → `main` | Automation opens a `[Port] … to beta` PR after merge |
| `beta` → `main`, `release/*` → `main`, `feature/release-*` → `main` | Post-merge automation syncs beta directly (no port PR) |
| Anything → `beta` | No downstream porting |

### When to port manually

- The user asks you to port before or instead of waiting on automation.
- A `[Port][Conflicts]` draft PR has real code conflicts (not just version files).
- You want the beta change reviewed and merged on your timeline.

### Block duplicate automated ports

Before merging the source PR on `main`, either:

- Add the **`porting/manual`** label to that PR, or
- Open a non-`port/*` PR to `beta` first (same head branch as the main PR, or title/body referencing `#<sourcePr>`).

Automation detects both and skips creating a duplicate `port/*` PR.

### Manual port workflow

1. Branch from **`beta`** (not `main`).
2. Cherry-pick or merge only the commits you need from the main PR.
3. **Keep beta's versions** of `package.json`, lockfiles, `CHANGELOG.md`, and `deploy/production-release.json` unless the port intentionally changes dependencies.
4. Open a PR **`your-branch → beta`**; include `Ports #<sourcePr>` in the title or body.
5. Run targeted tests. Beta PRs follow normal changelog policy.
6. Use a `port/*` branch only when finishing an automated draft port PR.

### Resolving an automated draft port PR

1. Check out `port/<n>-to-beta`.
2. Fix remaining conflict markers (version-policy files are usually auto-resolved now).
3. Mark the draft PR ready for review and merge when CI passes.
4. Close any duplicate manual PR if automation already opened the port PR.

### Do not

- Fan out to `feature/*` branches (removed; not supported).
- Open redundant `port/* → beta` PRs for merges post-merge already synced (CI blocks these via `scripts/lib/port-pr-policy.mjs`).
- Push directly to `beta` for port work — always use a PR.

Full release policy: [`docs/release-workflow.md`](docs/release-workflow.md). Key automation: [`.github/workflows/forward-port-stable-fix.yml`](.github/workflows/forward-port-stable-fix.yml), [`scripts/lib/port-targets.mjs`](scripts/lib/port-targets.mjs), [`scripts/lib/port-conflicts.mjs`](scripts/lib/port-conflicts.mjs).

