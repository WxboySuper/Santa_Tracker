export type ActivityState =
  'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'completed' | 'failed' | 'exited';

export type ActivityLifecycleEvent =
  | { type: 'load' }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'reset' }
  | { type: 'complete' }
  | { type: 'error'; code: string }
  | { type: 'exit' };

export type ActivityProgressEvent =
  { type: 'score'; value: number } | { type: 'achievement'; achievementId: string };

/** Renderer-independent events emitted by an activity instance. */
export type ActivityEvent = ActivityLifecycleEvent | ActivityProgressEvent;

export type ActivityLifecycle = {
  id: string;
  initialState: ActivityState;
  transitions: Record<ActivityState, ActivityState[]>;
};

const ALL_STATES: readonly ActivityState[] = [
  'idle',
  'loading',
  'ready',
  'playing',
  'paused',
  'completed',
  'failed',
  'exited',
];

export const DEFAULT_LIFECYCLE: ActivityLifecycle = {
  id: 'default',
  initialState: 'idle',
  transitions: {
    idle: ['loading', 'idle', 'failed', 'exited'],
    loading: ['ready', 'failed', 'exited'],
    ready: ['ready', 'playing', 'loading', 'failed', 'exited'],
    playing: ['paused', 'completed', 'failed', 'ready', 'exited'],
    paused: ['playing', 'failed', 'ready', 'exited'],
    completed: ['ready', 'failed', 'exited'],
    failed: ['loading', 'ready', 'failed', 'exited'],
    exited: ['loading', 'ready', 'failed', 'exited'],
  },
};

const EVENT_TARGET: Record<ActivityLifecycleEvent['type'], ActivityState> = {
  load: 'loading',
  start: 'playing',
  pause: 'paused',
  resume: 'playing',
  reset: 'ready',
  complete: 'completed',
  error: 'failed',
  exit: 'exited',
};

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isActivityState(value: unknown): value is ActivityState {
  return typeof value === 'string' && (ALL_STATES as readonly string[]).includes(value);
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Throw a descriptive configuration error for malformed lifecycle graphs. */
function assertLifecycleShape(lifecycle: ActivityLifecycle): void {
  if (!isStringRecord(lifecycle)) {
    throw new Error(`Invalid lifecycle configuration: expected an object`);
  }
  if (typeof lifecycle.id !== 'string' || lifecycle.id.trim() === '') {
    throw new Error('Invalid lifecycle configuration: id must be a non-empty string');
  }
  if (!isActivityState(lifecycle.initialState)) {
    throw new Error('Invalid lifecycle configuration: unknown initialState');
  }
  const transitions = lifecycle.transitions;
  if (!isStringRecord(transitions)) {
    throw new Error(`Invalid lifecycle configuration ${lifecycle.id}: transitions must be an object`);
  }
  for (const state of ALL_STATES) {
    const allowed = (transitions as Record<string, unknown>)[state];
    if (!Array.isArray(allowed) || !allowed.every(isActivityState)) {
      throw new Error(
        `Invalid lifecycle configuration ${lifecycle.id}: transitions for ${state} must list activity states`,
      );
    }
  }
}

export function canTransition(
  lifecycle: ActivityLifecycle,
  from: ActivityState,
  to: ActivityState,
): boolean {
  if (!isStringRecord(lifecycle)) return false;
  const transitions = lifecycle.transitions;
  if (!isStringRecord(transitions)) return false;
  const allowed = (transitions as Record<string, unknown>)[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function assertTransition(
  lifecycle: ActivityLifecycle,
  from: ActivityState,
  to: ActivityState,
): void {
  assertLifecycleShape(lifecycle);
  if (!canTransition(lifecycle, from, to)) {
    throw new Error(`Invalid transition ${from} -> ${to} for lifecycle ${lifecycle.id}`);
  }
}

type ScoreEvent = Extract<ActivityProgressEvent, { type: 'score' }>;
type AchievementEvent = Extract<ActivityProgressEvent, { type: 'achievement' }>;
type ErrorEvent = Extract<ActivityLifecycleEvent, { type: 'error' }>;

/**
 * Single source of truth for progress events: the keys of this record define
 * the accepted progress event types, so no separate type list is kept.
 */
const progressEventRules = {
  score: (currentState: ActivityState, event: ScoreEvent): string | undefined =>
    currentState === 'playing' && typeof event.value === 'number' && Number.isFinite(event.value)
      ? undefined
      : `Score events require a finite value while playing (state: ${currentState})`,
  achievement: (currentState: ActivityState, event: AchievementEvent): string | undefined => {
    const validState = currentState === 'playing' || currentState === 'completed';
    const validId = typeof event.achievementId === 'string' && event.achievementId.trim() !== '';
    return validState && validId
      ? undefined
      : `Achievement events require an id while playing or completed (state: ${currentState})`;
  },
} satisfies Record<ActivityProgressEvent['type'], (state: ActivityState, event: never) => string | undefined>;

function isProgressEvent(event: ActivityEvent): event is ActivityProgressEvent {
  return hasOwn(progressEventRules, event.type);
}

function applyScoreEvent(currentState: ActivityState, event: ScoreEvent): ActivityState {
  const message = progressEventRules.score(currentState, event);
  if (message !== undefined) throw new Error(message);
  return currentState;
}

function applyAchievementEvent(currentState: ActivityState, event: AchievementEvent): ActivityState {
  const message = progressEventRules.achievement(currentState, event);
  if (message !== undefined) throw new Error(message);
  return currentState;
}

function applyProgressEvent(currentState: ActivityState, event: ActivityProgressEvent): ActivityState {
  if (event.type === 'score') return applyScoreEvent(currentState, event);
  return applyAchievementEvent(currentState, event);
}

const lifecycleEventRules = {
  error: (_currentState: ActivityState, event: ErrorEvent): string | undefined =>
    typeof event.code === 'string' && event.code.trim() !== ''
      ? undefined
      : 'Error events require a stable code',
  start: (currentState: ActivityState): string | undefined =>
    currentState === 'paused'
      ? `Start events cannot resume a paused activity (state: ${currentState})`
      : undefined,
  resume: (currentState: ActivityState): string | undefined =>
    currentState === 'paused'
      ? undefined
      : `Resume events require paused state (state: ${currentState})`,
};

function validateLifecycleEvent(currentState: ActivityState, event: ActivityLifecycleEvent): void {
  if (!hasOwn(lifecycleEventRules, event.type)) return;
  const key = event.type as keyof typeof lifecycleEventRules;
  const rule = lifecycleEventRules[key] as (
    state: ActivityState,
    lifecycleEvent: ActivityLifecycleEvent,
  ) => string | undefined;
  const message = rule(currentState, event);
  if (message !== undefined) throw new Error(message);
}

function targetFor(event: ActivityLifecycleEvent): ActivityState {
  if (!hasOwn(EVENT_TARGET, event.type)) {
    throw new Error(`Unknown activity event type: ${event.type}`);
  }
  return EVENT_TARGET[event.type];
}

function applyLifecycleEvent(
  lifecycle: ActivityLifecycle,
  currentState: ActivityState,
  event: ActivityLifecycleEvent,
): ActivityState {
  // Resetting an idle activity is always a no-op, independent of custom graphs.
  if (event.type === 'reset' && currentState === 'idle') return 'idle';
  validateLifecycleEvent(currentState, event);
  const target = targetFor(event);
  assertTransition(lifecycle, currentState, target);
  return target;
}

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  'load',
  'start',
  'pause',
  'resume',
  'reset',
  'complete',
  'error',
  'exit',
  'score',
  'achievement',
]);

/**
 * Shallow discriminant guard: accepts objects whose `type` names a known event.
 * Malformed known payloads (score value, achievement id, error code) are
 * rejected with controlled errors by the per-event validators above.
 */
function isActivityEvent(value: unknown): value is ActivityEvent {
  if (!isStringRecord(value)) return false;
  return typeof value.type === 'string' && KNOWN_EVENT_TYPES.has(value.type);
}

/** Apply one lifecycle, score, or achievement event without renderer coupling. */
export function applyActivityEvent(
  lifecycle: ActivityLifecycle,
  currentState: ActivityState,
  event: ActivityEvent,
): ActivityState {
  if (!isActivityEvent(event)) {
    throw new Error('Invalid activity event');
  }

  if (isProgressEvent(event)) {
    return applyProgressEvent(currentState, event);
  }
  return applyLifecycleEvent(lifecycle, currentState, event);
}
