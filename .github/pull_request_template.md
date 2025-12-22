# Pull Request
<!--
PR Title Style Guide (repository-customized)

Purpose: keep PR titles consistent, machine-readable, and easy to scan in changelogs.

Format: `<type>(<scope>): <short description>`

- `type` (semantic keyword): `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`.
- `scope` (optional): short area of the codebase — use one of the repository scopes below to make review/triage easier.
- `short description`: imperative, present-tense, <= 50 characters where possible.

Recommended repository scopes (pick the most specific):
- `backend` — general backend changes
- `frontend` — general frontend/Vite/React changes
- `api` — public API endpoints, serializers
- `auth` — authentication/authorization logic
- `models` — database models and migrations
- `migrations` — schema/data migrations
- `routes` — routing/blueprints
- `tasks` — background jobs, task helpers
- `notifications` — in-app/email notifications
- `settings` — configuration and environment files
- `docs` — documentation and docs/ updates
- `infra` — deployment, Docker, nginx, systemd, CI/CD
- `github` — GitHub config and automation (.github/ workflows, actions, templates)
- `scripts` — scripts/* and tooling (bump, deploy, backups)
- `tests` — test infra and fixtures
- `deps` — dependency bumps (requirements, package.json)

Examples:
- `feat(api): add project search endpoint (#789)`
- `fix(auth): prevent duplicate session creation`

Best practices (brief):
- Keep the title focused and short; expand details in the PR body.
- Mention related issue IDs in the title only when helpful; prefer `Fixes #123` in the PR body.
-->

## Summary
<!-- Provide a short, clear summary of what this pull request changes and why. Keep it to 1–3 sentences. -->

## Related issues
<!--
Reference related issues using keywords like `Fixes #123` or `Closes #123` when applicable.

Best practices:
- Use `Fixes #<number>` to automatically close issues when the PR is merged.
- If multiple issues are related, list them and explain the relationship briefly.
- Note any dependency ordering (e.g. "merge after #123").
-->

## What changed
<!--
List the concrete changes made in this PR. Use short bullets and include file/feature names when helpful.

Best practices / what to include:
- Files & areas changed: `backend/models.py: fix validation`
- DB/migration notes: schema changes, data migrations, downstream impacts
- Performance/security considerations and any feature flags used
- Backwards-incompatible changes and necessary follow-up steps
-->

## Screenshots / Recordings (if applicable)
<!--
Add images or short recordings that demonstrate UI changes or important behavior differences.

Best practices:
- Prefer small, focused screenshots with brief captions. For recordings, keep them under 30s.
- Provide context: which route/flow, steps to reproduce the screenshot, and expected vs actual.
- Include accessible alt text for images.
-->

## Testing performed
<!--
Describe what you did to verify the change works. Keep this brief and actionable.

Best practices:
- List specific commands and steps used to test (example commands are helpful). Example: `pytest tests/test_models.py -k create`.
- Indicate whether CI passes locally or on remote, and which test suites were run.
- Note any manual test scenarios and edge cases verified.
-->
- Tested locally:
- Unit/integration tests added:

### Test configuration
<!--
Provide environment details so reviewers can reproduce tests:
- Browsers (if frontend) and versions
- OS and version
- Python/Node versions and major deps (e.g. `Python 3.11`, `Node 18`)
- Any env vars or feature flags required to run tests
-->
- **Browser(s)**:
- **Operating System**:
- **Python/Node**:
- **Env vars / flags**:

## Checklist (please complete before merging)
<!-- Checklist best practices:
- Only check items you have completed; don't use these boxes as selectors for PR type.
- If a checklist item requires a link (e.g. test run, CI), add it in "Testing performed" or "Additional notes".
-->
- [ ] I have performed a self-review of my code
- [ ] I have tested these changes locally
- [ ] I have added tests that cover my changes (if applicable)
- [ ] All new and existing tests pass
- [ ] I have updated the documentation (if applicable)
- [ ] My code follows the project's style guidelines

## Additional notes
<!-- Any other context, deployment notes, or caveats reviewers should know about. -->

## Reviewer notes (optional)
<!-- Anything you want reviewers to focus on (safety, correctness, design choices, edge cases). -->
