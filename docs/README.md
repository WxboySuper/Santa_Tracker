# Documentation

Use this page as the starting point for repo docs. Operational docs are grouped by workflow, architecture docs explain code ownership and boundaries, and stale planning material is archived for review before deletion.

## Architecture

- [Codebase inventory](./architecture/codebase-inventory.md) - issue #445 audit of folders, entry points, import risks, and reviewable move batches.

## Operations

- [Release workflow](./operations/release-workflow.md) - beta/main release, porting, changelog, and stale-branch automation.
- [Hosted rollout](./operations/hosted-rollout.md) - VPS layout, timed stage/promote flow, staging preview, and troubleshooting.
- [Timed production rollout](./operations/timed-production-rollout.md) - implementation plan for scheduled production promotion.
- [Alert banner](./operations/alert-banner.md) - runtime banner shape and timed-release banner behavior.
- [Emergency feature disable](./operations/emergency-feature-disable.md) - server-side emergency shutoff for server-backed beta capabilities.
- [Feature exposure workstreams](./operations/feature-exposure-workstreams.md) - v1.7 rollout registry adoption manifest.
- [Feature exposure testing](./operations/feature-exposure-testing.md) - disabled-side-effect fixture and coverage contract.
- [Auto-TSTM operations](./operations/auto-tstm-operations.md) - cached Auto-TSTM API behavior, cache health, and operational limits.
- [Auto-TSTM beta test plans](./operations/auto-tstm-beta-test-plans.md) - beta smoke plans for Auto-TSTM.
- [Auto-TSTM beta tester post](./operations/auto-tstm-beta-tester-post.md) - concise tester instructions.
- [Custom products beta tester checklist](./operations/custom-products-beta-test-plan.md) - a short Forecast-editor test for custom layers and saved products.

## Product

- [Outlook information](./product/outlook-info.md) - risk levels, probability values, and categorical conversion rules.

## Releases

- [v1.4.0 plan](./releases/v1.4.0-plan.md) - hosted accounts, sync, billing, and sustainability plan.
- [v1.3.0 notes](./releases/v1.3.0-draft.md) - workflow polish and visibility notes.
- [v1.2.0 notes](./releases/v1.2.0-launch.md) - editing safety nets launch notes.

## Archive Review

- [Review-removal manifest](./archive/review-removal/README.md) - stale docs moved out of the active docs path for deletion review.
