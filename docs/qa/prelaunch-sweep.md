# Pre-launch QA sweep

Status: in progress

## Scope

Check the public home page, tracker in normal, immersive, and TV modes, and Advent days 1 through 24 at 1440x900 and 390x844. Exercise keyboard navigation, reduced motion, blocked localStorage, date gating, invalid Advent routes, accessibility names, internal links, and phone overflow. Visual design review is out of scope. The sweep does not change the home page, `/village`, or tracker map art.

## Test setup

- Started the Next dev server from this checkout on port 3200 with `SEASON_OVERRIDE=open` and `ADVENT_ENABLED=true`.
- The server used `apps/web/data/advent_calendar.json` directly. The file was not printed, copied, or edited.
- Playwright headless Chromium checked 62 route and viewport combinations with reduced motion enabled.

## Findings so far

- No axe WCAG 2.1 A/AA violations appeared on the checked pages.
- No horizontal overflow appeared at either viewport.
- No broken internal links appeared on the calendar page.
- Invalid day routes `/advent/25` and `/advent/abc` return 404.
- The direct server's current date is before the calendar's unlock dates, so the live pass showed locked days. `SEASON_OVERRIDE=open` enables Advent access but does not override each day's unlock time. I will test unlocked activity content against the same data with a temporary server clock override.
- The existing TV dashboard test passed five consecutive runs against the direct server, including its London arrival assertion.

## Remaining

Walk all unlocked day content and activity kinds, inspect focus rings and keyboard paths, finish blocked-storage and console checks, investigate the intermittent TV arrival failure if it reproduces, and run the requested typecheck, lint, CSS lint, and relevant tests.
