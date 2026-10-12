# Activity SDK

`@santa-tracker/activity-sdk` contains browser-independent contracts shared by Advent activities.

## Input

Call `normalizeInput` with a small event-shaped object. Keyboard keys map to stable actions such as `left`, `confirm`, and `cancel`. Pointer and touch inputs use `primary` and report `start`, `move`, `end`, or `cancel` phases. The function returns `null` for an unsupported keyboard key. Browser adapters can translate native events into these objects without putting DOM types in activity logic.

## Audio and sensory preferences

Create preferences with `audioPreferencesFrom`. Audio is opt-in by default. `createAudioController` will not call its injected player when audio is disabled, muted, silent, or when `reducedSensory` is true. Volume is clamped to the inclusive range 0 to 1 before it reaches the player.

## Telemetry

Use `completionEvent` and `failureEvent` for activity outcomes. Their typed payloads contain the activity ID and gameplay metrics only. Do not add names, email addresses, account IDs, or other identity fields to these events.
