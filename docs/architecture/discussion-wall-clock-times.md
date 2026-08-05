# Discussion validity wall-clock times

Issue: [#701](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/701)

## Problem

`<input type="datetime-local">` interprets its value as the user's local
wall-clock time. The discussion validity controls (`validStart`/`validEnd`)
were previously pre-filled with `new Date().toISOString().slice(0, 16)`, which
formats in UTC. For a user in a non-UTC timezone, the displayed time was
shifted by the timezone offset.

## Change

`src/utils/datetimeLocal.ts` provides local wall-clock formatters/parsers:

- `toDatetimeLocal(date)` — formats a `Date` as local `YYYY-MM-DDTHH:mm`.
- `fromDatetimeLocal(value)` — parses a local value back to a `Date`.
- `isoToDatetimeLocal(isoString)` — converts a stored ISO timestamp to the
  local input value.

`useDiscussionFormState` (and the dormant `DiscussionEditor`) use these
helpers so values are pre-filled, displayed, and persisted in the user's local
wall-clock.

## Contract change

Previously, validity values were persisted as bare UTC strings (for example
`2026-07-16T14:00` with no timezone marker). They are now persisted as the
author's **local wall-clock** with no timezone marker. This is intentional:

- For a single author editing and re-opening their own discussion, the shown
  time matches what they entered.
- For a viewer in a different timezone, the value represents the author's
  wall-clock rather than the same instant. For a local-weather forecasting
  tool this is the desired semantic (issue times are expressed in local time),
  but it is a deliberate persistence-contract change.
- Legacy bare-UTC records are read with the same parsing and keep their
  original value (compatibility, not healing).

## Tests

`src/utils/datetimeLocal.test.ts` covers padding, round-trips, empty input,
midnight, and the "no timezone marker preserves as local" case.
