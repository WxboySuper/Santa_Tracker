# Activity SDK

`@santa-tracker/activity-sdk` provides browser-independent lifecycle and save contracts, plus shared input, audio, and telemetry helpers for Advent activities. Activities can use the same contracts with DOM, canvas, or optional WebGL renderers; the SDK does not own a rendering loop or require browser globals.

Import lifecycle and save helpers from their explicit subpaths. Input, audio, and telemetry also have dedicated subpaths:

```ts
import { applyActivityEvent } from '@santa-tracker/activity-sdk/lifecycle';
import { migrateActivitySave, type ActivitySaveMigration } from '@santa-tracker/activity-sdk/save';
import { normalizeInput } from '@santa-tracker/activity-sdk/input';
import { audioPreferencesFrom, createAudioController } from '@santa-tracker/activity-sdk/audio';
import { completionEvent, failureEvent } from '@santa-tracker/activity-sdk/telemetry';
```

## Lifecycle and progress events

`ActivityEvent` covers loading, start, pause, resume, reset, completion, errors, exit, score, and achievement progress. Use `applyActivityEvent` to validate an event against the current state and transition table. Load is valid from `idle`, `ready`, `failed`, or `exited`; start is valid from `ready`, resume from `paused`, and pause or completion from `playing`. Score and achievement events leave the lifecycle state unchanged. Scores must be finite and emitted while playing; achievements need a non-empty id and may be emitted while playing or immediately after completion.

`DEFAULT_LIFECYCLE` is the common state graph. This contract adds the `exited` state and expands several default transitions. Consumers that persist lifecycle states separately must handle `exited` and review the changed edges; `ActivitySaveEnvelope` does not version lifecycle state. `canTransition` validates the graph and runtime states, so malformed graphs or unknown runtime states throw `ActivityLifecycleError` instead of returning `false`.

Custom `ActivityLifecycle` graphs can narrow allowed transitions, but event source-state rules stay fixed. Adding an edge does not make `start` valid outside `ready` or `resume` valid outside `paused`. A graph may omit the optional `exited` transition list for compatibility; without an incoming edge to `exited`, exit attempts fail with `invalid_transition`. Reset returns a loaded activity to `ready`; resetting an idle activity is always a no-op and does not require an `idle -> idle` edge. Other same-state events still require their explicit self-loop in the transition table. Error events can move any state to `failed` in the default graph; custom graphs may reject the transition. Failed activities can return to `idle`, `loading`, or `ready` for recovery. Exit moves to `exited`; an exited activity can be loaded or reset for a later play session.

Error events carry a stable, non-personal `code`. Keep exception text and user-supplied content out of event payloads. Invalid configuration, state, transition, and event errors are instances of `ActivityLifecycleError` with a stable `code`. Renderer adapters can map browser keyboard, pointer, touch, audio, and rendering APIs to these contracts without changing lifecycle logic.

## Input

Call `normalizeInput` with a small event-shaped object. Keyboard keys map to stable actions such as `left`, `confirm`, and `cancel`; other single alphanumeric keys map to `key:<char>`. Pointer and touch inputs use `primary` (non-zero integer pointer buttons use `button:<n>`) and report `start`, `move`, `end`, or `cancel` phases. The function returns `null` for malformed input, unsupported keys, unknown kinds, and unknown event types. Finite `x`/`y` coordinates are preserved; non-finite values are dropped. Browser adapters can translate native events into these objects without putting DOM types in activity logic.

## Audio and sensory preferences

Create preferences with `audioPreferencesFrom`. Audio is opt-in by default. Volume defaults to 1 when unspecified and is clamped to the inclusive range 0 to 1; non-finite stored values resolve to silence. `createAudioController` will not call its injected player when preferences or the player are malformed, when the sound id is blank, when audio is disabled, muted, silent, or when `reducedSensory` is true. The trimmed sound id is forwarded to the player.

## Telemetry

Use `completionEvent` (accepts `score`, `durationMs`) and `failureEvent` (accepts `durationMs`, `reason`) for activity outcomes. Authoritative `activityId` and `event` fields cannot be overridden by caller payloads, extra keys are dropped, and only finite scores, non-negative finite durations, and non-empty trimmed reasons are kept. `activityId` must be a non-empty string; full canonical ID-pattern validation stays in `@santa-tracker/contracts`. These payloads contain activity IDs and gameplay metrics only. Do not add names, email addresses, account IDs, or other identity fields.

## Device-local saves

`migrateActivitySave` accepts unknown parsed device-local data and validates the envelope before migration. Store progress in an `ActivitySaveEnvelope` with the stable `ActivityId`, a positive safe integer `schemaVersion`, an extended ISO 8601 date-time string, and an activity-owned `payload`. `savedAtIso` must include seconds and a timezone marker, such as `2026-10-12T12:00:00.000Z` or `2026-10-12T12:00:00-05:00`. Numeric offsets can include a colon (`-05:00`) or omit it (`-0500`), and are limited to `-12:00` through `+14:00`; UTC may use `Z`. Saves are device-local and contain no visitor or account identity.

Payloads and extra envelope fields must contain plain JSON values: null, strings, booleans, finite numbers, arrays, and plain objects. Dates, maps, sets, `undefined`, functions, symbols, cycles, accessors, non-enumerable properties, and non-finite numbers are rejected so JSON storage preserves values after reload. Unknown JSON-compatible envelope metadata is intentionally preserved and cloned for forward compatibility; keep identity and personal data out of it. When an activity changes its payload shape, add one `ActivitySaveMigration` for each schema version step and call `migrateActivitySave` with the target version. Migrations are scoped to an activity id and run in ascending consecutive order. Each step must synchronously return a defined JSON-compatible payload; async results and `undefined` are rejected, while `null` is valid. Inputs and migration results are validated and cloned so migrations cannot mutate stored data through shared references. The activity remains responsible for validating the final payload against its own schema. Missing or duplicate steps, version gaps, invalid versions, and downgrades throw `ActivitySaveMigrationError`.

```ts
import { createActivityId } from '@santa-tracker/contracts';
import { migrateActivitySave, type ActivitySaveMigration } from '@santa-tracker/activity-sdk';

const activityId = createActivityId('snowman-puzzle');
const migrations: ActivitySaveMigration[] = [
  {
    activityId,
    fromVersion: 1,
    toVersion: 2,
    migrate: (payload) => ({ score: (payload as { points: number }).points }),
  },
];

const currentSave = migrateActivitySave(legacySave, 2, migrations);
```
