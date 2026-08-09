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
| Theme persistence + DOM | `src/store/persistence.ts` | Explicitly initialized by `src/index.tsx`; hydrates from `localStorage` and syncs `dark-mode` on change. |
| Forecast reducer | `src/store/forecastSlice.ts` | No `new Date()`/`Date.now()`/`Math.random()`/`localStorage`/`document` reads. Timestamps and cycle ids derive from `action.meta.timestamp`. |
| Workflow-active persistence | `src/store/persistence.ts` | Explicitly initialized by `src/index.tsx`; hydrates and syncs the `gfc-active-forecast-workflow` flag. |
| Custom product reducers | `src/store/custom{Category,Feature,Layer}Reducers.ts` | `touchCustomLayer` receives an explicit timestamp from the action. |

## What changed

- `themeSlice` and the store module no longer read `localStorage` or touch
  `document` at module load or inside reducers. Browser persistence moved to an
  idempotent `initializeStorePersistence` bootstrap called by `src/index.tsx`.
- `forecastSlice` replaced every reducer clock read with `readActionTimestamp(action)`
  and made `createEmptyOutlook` accept an explicit timestamp. The module-level
  initial state uses a fixed `INITIAL_TIMESTAMP`/`INITIAL_CYCLE_DATE`.
- `saveCurrentCycle` ids are now derived from the action timestamp instead of
  `Date.now()` + `Math.random()`.
- Workflow-active and theme persistence moved out of reducers into explicit
  store subscriptions in `persistence.ts`.
- Custom product reducers pass the action timestamp into `touchCustomLayer`.

## Verification

- `src/store/forecastDeterminism.test.ts` replays the same action sequence
  twice and asserts deeply equal output, plus checks timestamps flow through
  action payloads.
- `src/store/persistence.test.ts` verifies explicit hydration, persistence,
  DOM synchronization, and idempotent bootstrap.
- Full suite: 187 suites / 1099 tests pass; `typecheck`, `typecheck:test`, and
  `lint` pass.
