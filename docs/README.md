# Documentation

Use this page as the starting point for repository documentation. Architecture
docs explain code ownership and boundaries, while operational docs explain
repeatable workflows.

## Architecture

- [Repository map and architecture overview](./architecture/codebase-inventory.md) - product surfaces, boundaries, entry points, and safe future move direction.

## Operations

- [Release workflow](./operations/release-workflow.md) - release and deployment procedures.
- [Hosted rollout](./operations/hosted-rollout.md) - VPS rollout and troubleshooting.
- [Timed production rollout](./operations/timed-production-rollout.md) - scheduled promotion design.
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

Generated inventories and the local HTML site belong under ignored
`docs/personal`; regenerate them with the commands documented in the
architecture overview.
