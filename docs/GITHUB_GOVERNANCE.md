# GitHub governance

This page records the repository settings visible through GitHub on 2026-11-23. The repository ruleset named `f` targets the default branch and is active. A separate branch protection record for `main` was not present when checked.

## Current rules

The active ruleset configures the following:

- **Required status checks:** strict branch freshness is enabled. The required contexts are `JavaScript Linting`, `CSS Linting`, `HTML Linting`, and `Python Linting`.
- **Pull requests:** all changes require a pull request, but the minimum approving review count is zero. Code owner review and last-push approval are disabled. Review threads must be resolved. The ruleset allows merge, rebase, and squash merges.
- **Code scanning:** CodeQL alerts at medium severity or higher and analysis errors or warnings block the change.
- **Code quality:** warnings are configured as the enforcement threshold.
- **Bypass:** repository administrators can bypass the ruleset at all times.

## Required and advisory checks

The four lint contexts above are the only required status checks named in this ruleset. The requirement is strict, so the branch must be up to date with the target branch before those checks pass.

The repository also has checks for the current Next.js workspace, including lint, typecheck, unit tests, build, and Playwright E2E. These do not become required through the ruleset merely by running on a pull request. Bundle budgets are explicitly advisory. External review services such as CodeRabbit, CodeScene, and DeepSource may publish findings, but this ruleset does not require their approval. The active settings do not enforce a nonzero human approval count or Code Owner approval.

## Recommended owner changes

Review these settings in GitHub and update them by hand when the supporting checks are stable:

1. Replace the legacy Python, JavaScript, CSS, and HTML required contexts with stable workspace check names for lint, typecheck, unit tests, and build. Confirm each exact context appears on a pull request before making it required.
2. Promote the Playwright E2E job to required after it runs reliably on the default branch and pull requests.
3. Set a nonzero approval count and enable Code Owner review if owner approval should gate merges. Add the appropriate owner file before enabling that requirement.
4. Decide whether outside contributors should need approval for the latest push, and whether administrator bypass should stay unrestricted.
5. Keep bundle budgets advisory until the team has agreed on thresholds and a stable failure policy.
6. Configure grouped dependency updates, security features, and stale-branch cleanup after confirming their workflows and ownership.

Do not require a check until it runs on the default branch and reports a stable context. Changes to rulesets and branch protection are owner actions in GitHub settings, not repository-file changes.
