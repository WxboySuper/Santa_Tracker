# Activity SDK

`@santa-tracker/activity-sdk` contains browser-independent contracts shared by Advent activities.
Import these helpers from documented subpaths so clients load only what they need:

```ts
import { normalizeInput } from '@santa-tracker/activity-sdk/input';
import { audioPreferencesFrom, createAudioController } from '@santa-tracker/activity-sdk/audio';
import { completionEvent, failureEvent } from '@santa-tracker/activity-sdk/telemetry';
```

## Input

Call `normalizeInput` with a small event-shaped object. Keyboard keys map to stable actions such as `left`, `confirm`, and `cancel`; other single alphanumeric keys map to `key:<char>`. Pointer and touch inputs use `primary` (non-zero integer pointer buttons use `button:<n>`) and report `start`, `move`, `end`, or `cancel` phases. The function returns `null` for malformed input, unsupported keys, unknown kinds, and unknown event types. Finite `x`/`y` coordinates are preserved; non-finite values are dropped. Browser adapters can translate native events into these objects without putting DOM types in activity logic.

## Audio and sensory preferences

Create preferences with `audioPreferencesFrom`. Audio is opt-in by default. Volume is clamped to the inclusive range 0 to 1 at creation (non-finite values fall back to 1). `createAudioController` will not call its injected player when preferences or the player are missing, when the sound id is blank, when audio is disabled, muted, silent (including non-finite stored volume), or when `reducedSensory` is true.

## Telemetry

Use `completionEvent` (accepts `score`, `durationMs`) and `failureEvent` (accepts `durationMs`, `reason`) for activity outcomes. Authoritative `activityId` and `event` fields cannot be overridden by caller payloads, extra keys are dropped, and only finite scores, non-negative finite durations, and non-empty reasons are kept. `activityId` must be a non-empty string; full canonical ID-pattern validation stays in `@santa-tracker/contracts`. Their typed payloads contain the activity ID and gameplay metrics only. Do not add names, email addresses, account IDs, or other identity fields to these events.
