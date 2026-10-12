import {
  getOwnDataPropertyDescriptor,
  getOwnArrayLength,
  hasOwn,
  isArrayValue,
  isEnumerableDataProperty,
  isStringRecord,
} from './shared-guards';

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
  // Idle reset is handled as a no-op before this target is checked.
  reset: 'ready',
  complete: 'completed',
  error: 'failed',
  exit: 'exited',
};

function isActivityState(value: unknown): value is ActivityState {
  return typeof value === 'string' && (ALL_STATES as readonly string[]).includes(value);
}

function assertLifecycleRecord(lifecycle: unknown): asserts lifecycle is Record<string, unknown> {
  if (!isStringRecord(lifecycle)) {
    throw new ActivityLifecycleError('invalid_configuration', 'Invalid lifecycle configuration: expected an object');
  }
}

function getOwnLifecycleValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = getOwnDataPropertyDescriptor(record, key);
  if (!isEnumerableDataProperty(descriptor)) {
    throw new ActivityLifecycleError(
      'invalid_configuration',
      `Invalid lifecycle configuration: ${key} must be an own data property`,
    );
  }
  return descriptor.value;
}

function assertLifecycleId(id: unknown): asserts id is string {
  if (!isCanonicalNonEmptyString(id)) {
    throw new ActivityLifecycleError('invalid_configuration', 'Invalid lifecycle configuration: id must be a non-empty string');
  }
}

function isCanonicalNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value === value.trim();
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
): ActivityState[] {
  const descriptor = getOwnDataPropertyDescriptor(transitions, state);
  if (!isEnumerableDataProperty(descriptor)) {
    throw new ActivityLifecycleError(
      'invalid_configuration',
      `Invalid lifecycle configuration ${lifecycleId}: transitions for ${state} must list activity states`,
    );
  }
  if (!isArrayValue(descriptor.value)) {
    throw new ActivityLifecycleError(
      'invalid_configuration',
      `Invalid lifecycle configuration ${lifecycleId}: transitions for ${state} must list activity states`,
    );
  }
  const allowed = descriptor.value;
  const length = getOwnArrayLength(allowed);
  if (length === undefined) {
    throw new ActivityLifecycleError(
      'invalid_configuration',
      `Invalid lifecycle configuration ${lifecycleId}: transitions for ${state} must list activity states`,
    );
  }
  const normalized: ActivityState[] = [];
  for (let index = 0; index < length; index += 1) {
    const entry = getOwnDataPropertyDescriptor(allowed, String(index));
    if (!isEnumerableDataProperty(entry) || !isActivityState(entry.value)) {
      throw new ActivityLifecycleError(
        'invalid_configuration',
        `Invalid lifecycle configuration ${lifecycleId}: transitions for ${state} must list activity states`,
      );
    }
    normalized.push(entry.value);
  }
  return normalized;
}

function hasExplicitExitedTransitions(transitions: Record<string, unknown>): boolean {
  const descriptor = getOwnDataPropertyDescriptor(transitions, 'exited');
  if (descriptor === undefined) return false;
  if (!isEnumerableDataProperty(descriptor)) {
    throw new ActivityLifecycleError(
      'invalid_configuration',
      'Invalid lifecycle configuration: transitions for exited must be an own data property',
    );
  }
  return true;
}

/** Throw a descriptive configuration error for malformed lifecycle graphs. */
function assertKnownTransitionStates(input: {
  lifecycleId: string;
  transitions: Record<string, unknown>;
}): void {
  const { lifecycleId, transitions } = input;
  let keys: PropertyKey[];
  try {
    keys = Reflect.ownKeys(transitions);
  } catch {
    throw new ActivityLifecycleError('invalid_configuration', `Invalid lifecycle configuration ${lifecycleId}: transitions must be inspectable`);
  }
  for (const key of keys) {
    if (typeof key !== 'string' || !isActivityState(key)) {
      throw new ActivityLifecycleError(
        'invalid_configuration',
        `Invalid lifecycle configuration ${lifecycleId}: unknown transition state`,
      );
    }
  }
}

function assertExitedTransitionsIfReachable(input: {
  lifecycleId: string;
  initialState: ActivityState;
  transitions: Partial<Record<ActivityState, ActivityState[]>>;
}): void {
  const { lifecycleId, initialState, transitions } = input;
  if (hasOwn(transitions, 'exited')) return;
  const canReachExited = Object.values(transitions).some((allowed) => allowed?.includes('exited') ?? false);
  if (initialState !== 'exited' && !canReachExited) return;
  throw new ActivityLifecycleError(
    'invalid_configuration',
    `Invalid lifecycle configuration ${lifecycleId}: transitions for exited are required when exited is reachable`,
  );
}

function assertRequiredStateTransitions(input: {
  lifecycleId: string;
  transitions: Record<string, unknown>;
}): Partial<Record<ActivityState, ActivityState[]>> {
  const { lifecycleId, transitions } = input;
  const hasExitedTransitions = hasExplicitExitedTransitions(transitions);
  const normalized: Partial<Record<ActivityState, ActivityState[]>> = {};
  for (const state of ALL_STATES) {
    if (state === 'exited' && !hasExitedTransitions) continue;
    normalized[state] = assertStateTransitions(transitions, lifecycleId, state);
  }
  return normalized;
}

type ValidatedActivityLifecycle = {
  id: string;
  transitions: Partial<Record<ActivityState, ActivityState[]>>;
};

function assertLifecycleShape(lifecycle: unknown): ValidatedActivityLifecycle {
  assertLifecycleRecord(lifecycle);
  const lifecycleId = getOwnLifecycleValue(lifecycle, 'id');
  assertLifecycleId(lifecycleId);
  const initialState = getOwnLifecycleValue(lifecycle, 'initialState');
  assertInitialState(initialState);
  const transitions = getTransitions(lifecycleId, getOwnLifecycleValue(lifecycle, 'transitions'));
  assertKnownTransitionStates({ lifecycleId, transitions });
  const normalized = assertRequiredStateTransitions({ lifecycleId, transitions });
  assertExitedTransitionsIfReachable({ lifecycleId, initialState, transitions: normalized });
  return { id: lifecycleId, transitions: normalized };
}

function getAllowedTransitions(
  lifecycle: ValidatedActivityLifecycle,
  from: ActivityState,
): ActivityState[] | undefined {
  return hasOwn(lifecycle.transitions, from) ? lifecycle.transitions[from] : undefined;
}

export function canTransition(
  lifecycle: ActivityLifecycle,
  from: ActivityState,
  to: ActivityState,
): boolean {
  const validatedLifecycle = assertLifecycleShape(lifecycle);
  assertCurrentState(from);
  assertCurrentState(to);
  const allowed = getAllowedTransitions(validatedLifecycle, from);
  return allowed?.includes(to) ?? false;
}

function assertTransitionAllowed(
  lifecycle: ValidatedActivityLifecycle,
  from: ActivityState,
  to: ActivityState,
): void {
  assertCurrentState(from);
  assertCurrentState(to);
  const allowed = getAllowedTransitions(lifecycle, from);
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
  const validatedLifecycle = assertLifecycleShape(lifecycle);
  assertTransitionAllowed(validatedLifecycle, from, to);
}

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
  score: (currentState: ActivityState, event: Extract<ActivityProgressEvent, { type: 'score' }>): string | undefined => {
    const value = getEventValue(event, 'value');
    return currentState === 'playing'
    && typeof value === 'number'
    && Number.isFinite(value)
      ? undefined
      : `Score events require a finite value while playing (state: ${currentState})`;
  },
  achievement: (currentState: ActivityState, event: Extract<ActivityProgressEvent, { type: 'achievement' }>): string | undefined => {
    const validState = currentState === 'playing' || currentState === 'completed';
    const achievementId = getEventValue(event, 'achievementId');
    const validId = isCanonicalNonEmptyString(achievementId);
    return validState && validId
      ? undefined
      : `Achievement events require an id while playing or completed (state: ${currentState})`;
  },
} satisfies ProgressEventRuleMap;

function isProgressEventType(type: ActivityEvent['type']): type is ActivityProgressEvent['type'] {
  return hasOwn(progressEventRules, type);
}

function applyProgressEvent(
  currentState: ActivityState,
  event: ActivityEvent,
  type: ActivityProgressEvent['type'],
): ActivityState {
  let message: string | undefined;
  switch (type) {
    case 'score':
      message = progressEventRules.score(
        currentState,
        event as Extract<ActivityProgressEvent, { type: 'score' }>,
      );
      break;
    case 'achievement':
      message = progressEventRules.achievement(
        currentState,
        event as Extract<ActivityProgressEvent, { type: 'achievement' }>,
      );
      break;
    default:
      throw new ActivityLifecycleError(
        'invalid_event',
        `Unsupported progress event type: ${String(type)}`,
      );
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
    isCanonicalNonEmptyString(getEventValue(event, 'code'))
      ? undefined
      : 'Error events require a stable code',
  exit: (): undefined => undefined,
} satisfies Record<ActivityLifecycleEvent['type'], LifecycleEventRule>;

function validateLifecycleEvent(
  currentState: ActivityState,
  event: ActivityLifecycleEvent,
  type: ActivityLifecycleEvent['type'],
): void {
  const rule = lifecycleEventRules[type];
  const message = rule(currentState, event);
  if (message !== undefined) {
    throw new ActivityLifecycleError('invalid_event', message);
  }
}

function targetFor(type: ActivityLifecycleEvent['type']): ActivityState {
  return EVENT_TARGET[type];
}

function applyLifecycleEvent(
  lifecycle: ValidatedActivityLifecycle,
  currentState: ActivityState,
  event: ActivityEvent,
  type: ActivityLifecycleEvent['type'],
): ActivityState {
  // Resetting an idle activity is always a no-op, independent of custom graphs.
  if (type === 'reset' && currentState === 'idle') return 'idle';
  validateLifecycleEvent(currentState, event as ActivityLifecycleEvent, type);
  const target = targetFor(type);
  assertTransitionAllowed(lifecycle, currentState, target);
  return target;
}

function assertCurrentState(value: unknown): asserts value is ActivityState {
  if (!isActivityState(value)) {
    throw new ActivityLifecycleError('invalid_state', `Invalid activity state: ${formatInvalidState(value)}`);
  }
}

function formatInvalidState(value: unknown): string {
  try {
    return String(value);
  } catch {
    try {
      return Object.prototype.toString.call(value);
    } catch {
      return '[unprintable]';
    }
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
function getActivityEventType(value: unknown): ActivityEvent['type'] | undefined {
  if (!isStringRecord(value)) return undefined;
  const descriptor = getOwnDataPropertyDescriptor(value, 'type');
  if (!isEnumerableDataProperty(descriptor)) return undefined;
  const type: unknown = descriptor.value;
  return typeof type === 'string' && KNOWN_EVENT_TYPES.has(type)
    ? type as ActivityEvent['type']
    : undefined;
}

function getEventValue(event: object, key: string): unknown {
  const descriptor = getOwnDataPropertyDescriptor(event, key);
  if (!isEnumerableDataProperty(descriptor)) return undefined;
  return descriptor.value;
}

/** Apply one lifecycle, score, or achievement event without renderer coupling. */
export function applyActivityEvent(
  lifecycle: ActivityLifecycle,
  currentState: ActivityState,
  event: ActivityEvent,
): ActivityState {
  const eventType = getActivityEventType(event);
  if (eventType === undefined) {
    throw new ActivityLifecycleError('invalid_event', 'Invalid activity event');
  }

  const validatedLifecycle = assertLifecycleShape(lifecycle);
  assertCurrentState(currentState);
  if (isProgressEventType(eventType)) {
    return applyProgressEvent(currentState, event, eventType);
  }
  return applyLifecycleEvent(validatedLifecycle, currentState, event, eventType);
}
