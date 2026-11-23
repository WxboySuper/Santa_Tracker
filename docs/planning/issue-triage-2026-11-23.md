# Issue triage, 2026-11-23

An audit of every open issue against `main` (six read-only audits, each issue checked in code, tests or CI rather
than by its title). This records the verdicts and the plan for what is not yet addressed. Launch is Dec 24, 2026,
10:00 UTC.

## Closed today

| Issue | Why |
| --- | --- |
| #267 Shared input, audio, accessibility, telemetry | Done: `packages/activity-sdk`, `docs/ACTIVITY_SDK.md`, unit tests. |
| #281 to #284 Story chapters 1 to 4 | Superseded by the eight readable "Night Shift" chapters (`docs/planning/ADVENT_VOICE_AND_PLAN.md`). |
| #318 Staging-to-production promotion | Obsolete: Cloudflare Workers deploys on merge to `main` with a smoke test and a rollback runbook. |
| #319 Self-hosted health, logs, metrics, backups | Obsolete: replaced by Workers plus R2 snapshots (ADR 0002 and 0003). |

## Being addressed now (non-UI work, Codex workers; each in its own PR)

| Work | Issues |
| --- | --- |
| Run Playwright and axe in CI with failure artifacts | #312, #314 |
| Bundle and performance budgets in CI; Conventional PR title and changelog check | #315, #310 |
| Route response carries a version and server time; clock-sync and monotonic position guard; boundary tests; map adapter contract tests | #251, #253 |
| Browser tests for the nine existing Advent activities; regression tests for the indexed day lookup | #277, #279, #280, #286, #287, #288, #289, #292, #293, #334 |
| Local rehearsal, load, map-outage and snapshot-recovery runs with a recorded report | #322, #323, #325, #326, #327, #328 |
| Decision documents and ADR drafts (map delivery, weather, route pacing, Western Hemisphere thresholds, archive takedown, freeze gates, tooling roles, editorial guide) | #252, #320, #241, #245, #421, #321, #317, #261 |
| Route generator rework from an independent review, with a mechanical `route:audit` | #249 (workflow part), #242, #243, #244, #247 |

## Done by hand

- Tracker countdown no longer sits under the mode buttons (#512).
- The pole visit respects reduced motion (#513, part of #254).

## Needs the owner

| Issue | Decision |
| --- | --- |
| #225 North Pole visual style and asset-pipeline ADR | Approve the direction the shipped village established. |
| #245 Western Hemisphere confidence thresholds | Approve the thresholds proposed in the decision pack. |
| #264 Deep articles for major stops | Choose the stops and editorial scope. |
| #421 Archive takedown policy | Ratify the current "override hides archived content" policy or choose immutable archives. |
| #249 Final route approval | The route review itself. |

## Deferred past Dec 24 (with reason)

These are real work but not needed for a safe, good launch, and several are owner-only tooling.

- **Admin studio** (#205, #295 to #303): passkeys, drafts and revisions, route and content editors, media library, snapshot
  workflow. Emergency switches and password login cover launch.
- **Device-local profile** (#206, #304 to #308): profile schema, achievements, decorations, favourites.
- **World content** (#203, #260, #262, #263, #265): source-required card schema, review workflow, cards per stop, World
  Library. The cards depend on the final route; revisit once the route is approved.
- **North Pole hub rework** (#200, #226, #227, #234 to #239): the shipped village covers the experience; the six-destination
  hub, season modes and settings centre are a larger redesign.
- **Missing Advent games and quizzes** (#204, #268, #270 to #276, #278, #285, #290, #291, #294): five games, a logic grid, a
  science and a tracker quiz, a curated fallback library. Needs an owner decision on whether the 2026 Advent plan still
  wants them.
- **Tracker extras** (#202, #255 to #259): active-location card and drawer, arrival refinement, journey statistics, replay.
- **Quality extras** (#309, #311, #313, #330): formatting gate and required-check update, SemVer deploy identity, visual
  baselines, GitHub Project governance.
- **Post-season** (#329): after the season.
- **Parent trackers** (#198, #200 to #208): stay open until their children close.
