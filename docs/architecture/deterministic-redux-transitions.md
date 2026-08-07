# Deterministic Redux state transitions

Issue: [#715](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/715)

## Goal

Reducers and module initialization must be free of clocks, storage, DOM,
network, and ambient mutable state so replay, hydration, tests, and debugging
do not depend on execution timing or browser environment.

## Ownership and dependency direction

| Concern | Owner | Notes |
| --- | --- | --- |
| Timestamp stamping | `src/store/timestampMiddleware.ts` | Stamps `action.meta.timestamp` at dispatch time; `readActionTimestamp` reads it with a live fallback for direct reducer calls. |
| Theme reducer | `src/store/themeSlice.ts` | Pure state transitions only. |
| Theme persistence + DOM | `src/store/index.ts` subscription | Hydrates from `localStorage` at startup and syncs `dark-mode` class on change. |
| Forecast reducer | `src/store/forecastSlice.ts` | No `new Date()`/`Date.now()`/`Math.random()`/`localStorage`/`document` reads. Timestamps and cycle ids derive from `action.meta.timestamp`. |
| Workflow-active persistence | `src/store/index.ts` subscription | Hydrates the `gfc-active-forecast-workflow` flag at startup and syncs it on change. |
| Custom product reducers | `src/store/custom{Category,Feature,Layer}Reducers.ts` | `touchCustomLayer` receives an explicit timestamp from the action. |

## What changed

- `themeSlice` no longer reads `localStorage` or touches `document` at module
  load or inside reducers; both moved to a store subscription.
- `forecastSlice` replaced every reducer clock read with `readActionTimestamp(action)`
  and made `createEmptyOutlook` accept an explicit timestamp. The module-level
  initial state uses a fixed `INITIAL_TIMESTAMP`/`INITIAL_CYCLE_DATE`.
- `saveCurrentCycle` ids are now derived from the action timestamp instead of
  `Date.now()` + `Math.random()`.
- Workflow-active and theme persistence moved out of reducers into store
  subscriptions in `index.ts`.
- Custom product reducers pass the action timestamp into `touchCustomLayer`.

## Verification

- `src/store/forecastDeterminism.test.ts` replays the same action sequence
  twice and asserts deeply equal output, plus checks timestamps flow through
  action payloads.
- Full suite: 187 suites / 1099 tests pass; `typecheck`, `typecheck:test`, and
  `lint` pass.
