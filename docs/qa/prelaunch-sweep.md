# Pre-launch QA sweep

Status: complete

## Scope

Checked the public home page, tracker in normal, immersive, and TV modes, and Advent days 1 through 24 at 1440x900 and 390x844. Exercised keyboard navigation, reduced motion, blocked localStorage, date gating, invalid Advent routes, accessibility names, internal links, phone overflow, console errors, and placeholder strings. Visual design review was out of scope. The sweep did not change the home page, `/village`, or tracker map art.

## Test setup

- Started the Next dev server from this checkout on port 3200 with `SEASON_OVERRIDE=open` and `ADVENT_ENABLED=true`.
- The server used `apps/web/data/advent_calendar.json` directly. The file was not printed, copied, or edited.
- On the current date, November 6, all Advent days are still locked. The route pages return 200 with locked content, the day API returns 403 for days 1, 2, and 24, and day 25 returns 404.
- To reach the scheduled content, I temporarily injected a Christmas date into the Advent trusted clock in local source, then reverted the change. The same repo calendar remained in place. This produced 48 day/viewport checks with each day unlocked.

## Findings fixed

- Day 7 light-show status text had insufficient contrast on the dark stage.
- Day 12 jigsaw cell numbers had insufficient contrast.
- Day 15 winter-world list buttons used aria labels that omitted their visible titles.
- The light-show animation used a longer transition when reduced motion was requested. It now removes the transition.
- Tracker e2e tests depended on whichever route stops happened to be in the future. They now provide a future London stop in the API response so the arrival checks stay deterministic.

## Findings left

- No functional, accessibility, copy, overflow, date-gating, or broken-link defects remain from this sweep.
- Visual design issues were not assessed. Home, `/village`, and tracker map art were outside the change scope.

## Checks

- 62 route/viewport checks on the direct app, plus 48 unlocked Advent day/viewport checks.
- Axe found no WCAG 2.1 A/AA violations after the fixes.
- No horizontal overflow, missing keyboard focus indicators, storage-related errors, untranslated keys, or placeholder strings appeared.
- Internal links returned successfully. `/advent/25` and `/advent/abc` returned 404 as expected.
- The Ornament Smash iframe started using only the keyboard.
- All 9 immersive and TV tracker Playwright tests passed against the direct server. London arrival and long-stop assertions each passed across repeated runs after adding deterministic route data.
- The relevant activity Vitest file passed 6 tests. `pnpm typecheck`, `pnpm lint`, and `pnpm lint:css` passed.
