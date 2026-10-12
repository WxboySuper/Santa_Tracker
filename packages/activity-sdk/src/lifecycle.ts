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
  transitions: Record<Exclude<ActivityState, 'exited'>, ActivityState[]> & {
    exited?: ActivityState[];
  };
};

export type ActivityLifecycleErrorCode =
  | 'invalid_configuration'
  | 'invalid_state'
  | 'invalid_transition'
  | 'invalid_event';

export class ActivityLifecycleError extends Error {
  readonly name = 'ActivityLifecycleError';

  constructor(
    readonly code: ActivityLifecycleErrorCode,
    message: string,
  ) {
    super(message);
  }
}

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
    idle: ['loading', 'failed', 'exited'],
    loading: ['ready', 'failed', 'exited'],
    ready: ['ready', 'playing', 'loading', 'failed', 'exited'],
    playing: ['paused', 'completed', 'failed', 'ready', 'exited'],
    paused: ['playing', 'failed', 'ready', 'exited'],
    completed: ['ready', 'failed', 'exited'],
    failed: ['loading', 'ready', 'idle', 'failed', 'exited'],
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

function assertLifecycleRecord(lifecycle: unknown): asserts lifecycle is Record<string, unknown> {
  if (!isStringRecord(lifecycle)) {
    throw new ActivityLifecycleError('invalid_configuration', 'Invalid lifecycle configuration: expected an object');
  }
}

function assertLifecycleId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new ActivityLifecycleError('invalid_configuration', 'Invalid lifecycle configuration: id must be a non-empty string');
  }
}

function assertInitialState(state: unknown): asserts state is ActivityState {
  if (!isActivityState(state)) {
    throw new ActivityLifecycleError('invalid_configuration', 'Invalid lifecycle configuration: unknown initialState');
  }
}

function getTransitions(id: string, value: unknown): Record<string, unknown> {
  if (!isStringRecord(value)) {
    throw new ActivityLifecycleError('invalid_configuration', `Invalid lifecycle configuration ${id}: transitions must be an object`);
  }
  return value;
}

function assertStateTransitions(
  transitions: Record<string, unknown>,
  lifecycleId: string,
  state: ActivityState,
): void {
  const allowed = transitions[state];
  if (!hasOwn(transitions, state) || !Array.isArray(allowed)) {
    throw new ActivityLifecycleError(
      'invalid_configuration',
      `Invalid lifecycle configuration ${lifecycleId}: transitions for ${state} must list activity states`,
    );
  }
  if (!allowed.every(isActivityState)) {
    throw new ActivityLifecycleError(
      'invalid_configuration',
      `Invalid lifecycle configuration ${lifecycleId}: transitions for ${state} must list activity states`,
    );
  }
}

/** Throw a descriptive configuration error for malformed lifecycle graphs. */
function assertLifecycleShape(lifecycle: ActivityLifecycle): void {
  assertLifecycleRecord(lifecycle);
  assertLifecycleId(lifecycle.id);
  assertInitialState(lifecycle.initialState);
  const transitions = getTransitions(lifecycle.id, lifecycle.transitions);
  for (const state of ALL_STATES) {
    if (state === 'exited' && !hasOwn(transitions, state)) continue;
    assertStateTransitions(transitions, lifecycle.id, state);
  }
}

export function canTransition(
  lifecycle: ActivityLifecycle,
  from: ActivityState,
  to: ActivityState,
): boolean {
  assertLifecycleShape(lifecycle);
  const allowed = lifecycle.transitions[from];
  return allowed?.includes(to) ?? false;
}

function assertTransitionAllowed(
  lifecycle: ActivityLifecycle,
  from: ActivityState,
  to: ActivityState,
): void {
  const allowed = lifecycle.transitions[from];
  if (!allowed?.includes(to)) {
    throw new ActivityLifecycleError(
      'invalid_transition',
      `Invalid transition ${from} -> ${to} for lifecycle ${lifecycle.id}`,
    );
  }
}

export function assertTransition(
  lifecycle: ActivityLifecycle,
  from: ActivityState,
  to: ActivityState,
): void {
  assertLifecycleShape(lifecycle);
  assertTransitionAllowed(lifecycle, from, to);
}

type ScoreEvent = Extract<ActivityProgressEvent, { type: 'score' }>;
type AchievementEvent = Extract<ActivityProgressEvent, { type: 'achievement' }>;
type ProgressEventRuleMap = {
  [Type in ActivityProgressEvent['type']]: (
    state: ActivityState,
    event: Extract<ActivityProgressEvent, { type: Type }>,
  ) => string | undefined;
};

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
} satisfies ProgressEventRuleMap;

function isProgressEvent(event: ActivityEvent): event is ActivityProgressEvent {
  return hasOwn(progressEventRules, event.type);
}

function applyProgressEvent(currentState: ActivityState, event: ActivityProgressEvent): ActivityState {
  let message: string | undefined;
  switch (event.type) {
    case 'score':
      message = progressEventRules.score(currentState, event);
      break;
    case 'achievement':
      message = progressEventRules.achievement(currentState, event);
      break;
    default:
      throw new ActivityLifecycleError('invalid_event', 'Unknown progress event type');
  }
  if (message !== undefined) throw new ActivityLifecycleError('invalid_event', message);
  return currentState;
}

type LifecycleEventRule = (
  currentState: ActivityState,
  event: ActivityLifecycleEvent,
) => string | undefined;

const LOADABLE_STATES: readonly ActivityState[] = ['idle', 'ready', 'failed', 'exited'];

const lifecycleEventRules = {
  load: (currentState: ActivityState): string | undefined =>
    LOADABLE_STATES.includes(currentState)
      ? undefined
      : `Load events require an idle, ready, failed, or exited activity (state: ${currentState})`,
  start: (currentState: ActivityState): string | undefined =>
    currentState === 'ready'
      ? undefined
      : `Start events require ready state (state: ${currentState})`,
  pause: (currentState: ActivityState): string | undefined =>
    currentState === 'playing'
      ? undefined
      : `Pause events require playing state (state: ${currentState})`,
  resume: (currentState: ActivityState): string | undefined =>
    currentState === 'paused'
      ? undefined
      : `Resume events require paused state (state: ${currentState})`,
  reset: (): undefined => undefined,
  complete: (currentState: ActivityState): string | undefined =>
    currentState === 'playing'
      ? undefined
      : `Complete events require playing state (state: ${currentState})`,
  error: (_currentState: ActivityState, event: ActivityLifecycleEvent): string | undefined =>
    event.type === 'error' && typeof event.code === 'string' && event.code.trim() !== ''
      ? undefined
      : 'Error events require a stable code',
  exit: (): undefined => undefined,
} satisfies Record<ActivityLifecycleEvent['type'], LifecycleEventRule>;

function validateLifecycleEvent(currentState: ActivityState, event: ActivityLifecycleEvent): void {
  const message = lifecycleEventRules[event.type](currentState, event);
  if (message !== undefined) {
    throw new ActivityLifecycleError('invalid_event', message);
  }
}

function targetFor(event: ActivityLifecycleEvent): ActivityState {
  if (!hasOwn(EVENT_TARGET, event.type)) {
    throw new ActivityLifecycleError('invalid_event', `Unknown activity event type: ${event.type}`);
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
  assertTransitionAllowed(lifecycle, currentState, target);
  return target;
}

function assertCurrentState(value: unknown): asserts value is ActivityState {
  if (!isActivityState(value)) {
    throw new ActivityLifecycleError('invalid_state', `Invalid activity state: ${String(value)}`);
  }
}

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  ...Object.keys(EVENT_TARGET),
  ...Object.keys(progressEventRules),
]);

/**
 * Shallow discriminant guard: accepts objects whose `type` names a known event.
 * Malformed known payloads (score value, achievement id, error code) are
 * rejected with controlled errors by the per-event validators above.
 */
function isActivityEvent(value: unknown): value is ActivityEvent {
  if (!isStringRecord(value)) return false;
  return hasOwn(value, 'type') && typeof value.type === 'string' && KNOWN_EVENT_TYPES.has(value.type);
}

/** Apply one lifecycle, score, or achievement event without renderer coupling. */
export function applyActivityEvent(
  lifecycle: ActivityLifecycle,
  currentState: ActivityState,
  event: ActivityEvent,
): ActivityState {
  if (!isActivityEvent(event)) {
    throw new ActivityLifecycleError('invalid_event', 'Invalid activity event');
  }

  assertCurrentState(currentState);
  assertLifecycleShape(lifecycle);
  if (isProgressEvent(event)) {
    return applyProgressEvent(currentState, event);
  }
  return applyLifecycleEvent(lifecycle, currentState, event);
}
