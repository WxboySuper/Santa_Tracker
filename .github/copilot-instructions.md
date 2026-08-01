# Graphical Forecast Creator (GFC) - Development Instructions

## 🛠️ Core Directives
1. **Process over Code**: Prioritize maintaining the development workflow and documentation standards over specific implementation details, as the codebase is dynamic.
2. **Pnpm First**: This project uses `pnpm`. Never use `npm` or `yarn` for dependency management.

## 🌿 Branching & Workflow
*   **Main Branch**: Next-major integration line. Any source branch may open a PR to `main`; required checks and review determine readiness.
*   **Stable Branches**: Production maintenance lines use `stable/X.Y.x` (for example, `stable/1.6.x`). Production hotfixes start here, release here, and are forward-ported to `main`.
*   **Feature Branches**: Branch names are descriptive conventions, not merge gates.
*   **Bugfix Branches**: `fix/[bug-description]` (e.g., `fix/map-flicker`).
*   **Hotfix Branches**: `hotfix/[critical-fix]` from the current stable line.
*   **Forward Porting**: After a stable-line merge, automation may open a draft port PR into `main`. Review and resolve rewrite-specific differences there; never merge `main` back into a stable line.

## 📝 Commit Message Conventions
Use [Conventional Commits](https://www.conventionalcommits.org/):
*   `feat:` New features.
*   `fix:` Bug fixes.
*   `chore:` Maintenance, dependency updates, configuration.
*   `docs:` Documentation changes.
*   `style:` Formatting, missing semi-colons, etc. (no code changes).
*   `refactor:` Code changes that neither fix a bug nor add a feature.

**Example**: `feat(map): add support for high-resolution CWA boundaries`

## 📖 Change Documentation
### 1. Changelogs
Every PR must declare exactly one `Changelog-Impact: beta|hotfix|none|inherited` value. The required CI check blocks merging when the declaration is missing or inconsistent with the changed files. Beta and hotfix entries use their separate unreleased lanes in [CHANGELOG.md](../CHANGELOG.md); forward ports inherit the source entry.
*   `Added`: For new features.
*   `Changed`: For changes in existing functionality.
*   `Deprecated`: For soon-to-be removed features.
*   `Removed`: For now-removed features.
*   `Fixed`: For any bug fixes.
*   `Security`: In case of vulnerabilities.
*   `Dependencies`: For dependency version bumps (Dependabot PRs auto-update this subsection).

### 2. Update Notes
When structural changes (schema migrations, API changes, new store slices) occur:
*   Document the "Why" and "How to migrate" in the relevant doc file within `docs/`.
*   Update `ROADMAP.md` if a milestone is reached.

## 🏗️ Development Process
1.  **Exploration**: Always check `package.json` and existing hooks/utils before reinventing logic.
2.  **Implementation**: 
    *   Use functional components with TypeScript.
    *   State management via Redux Toolkit (`src/store`).
    *   Styling via Tailwind CSS (v3).
3.  **Validation**:
    *   Verify builds with `pnpm run build` (uses `cross-env` for stability).
    *   Check for security vulnerabilities with `pnpm audit`.
4.  **Handoff**: After implementing changes, summarize what was done and which documentation (Changelog/Roadmap) was updated. Always remind the user to review and commit.
