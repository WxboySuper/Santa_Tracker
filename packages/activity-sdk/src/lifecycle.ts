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

export const DEFAULT_LIFECYCLE: ActivityLifecycle = {
  id: 'default',
  initialState: 'idle',
  transitions: {
    idle: ['loading', 'idle', 'exited'],
    loading: ['ready', 'failed', 'exited'],
    ready: ['ready', 'playing', 'loading', 'exited'],
    playing: ['paused', 'completed', 'failed', 'ready', 'exited'],
    paused: ['playing', 'failed', 'ready', 'exited'],
    completed: ['ready', 'exited'],
    failed: ['loading', 'ready', 'exited'],
    exited: ['loading', 'ready', 'exited'],
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

const PROGRESS_EVENT_TYPES = new Set<ActivityProgressEvent['type']>(['score', 'achievement']);

export function canTransition(
  lifecycle: ActivityLifecycle,
  from: ActivityState,
  to: ActivityState,
): boolean {
  const allowed = lifecycle?.transitions?.[from] ?? [];
  return allowed.includes(to);
}

export function assertTransition(
  lifecycle: ActivityLifecycle,
  from: ActivityState,
  to: ActivityState,
): void {
  if (!canTransition(lifecycle, from, to)) {
    throw new Error(`Invalid transition ${from} -> ${to} for lifecycle ${lifecycle?.id ?? 'unknown'}`);
  }
}

type ProgressEventRule = (currentState: ActivityState, event: ActivityProgressEvent) => string | undefined;

const progressEventRules: Record<ActivityProgressEvent['type'], ProgressEventRule> = {
  score: (currentState, event) =>
    currentState !== 'playing' || !Number.isFinite((event as { value: number }).value)
      ? `Score events require a finite value while playing (state: ${currentState})`
      : undefined,
  achievement: (currentState, event) => {
    const achievementId = (event as { achievementId: unknown }).achievementId;
    const validState = currentState === 'playing' || currentState === 'completed';
    return validState && typeof achievementId === 'string' && achievementId.trim() !== ''
      ? undefined
      : `Achievement events require an id while playing or completed (state: ${currentState})`;
  },
};

function applyProgressEvent(currentState: ActivityState, event: ActivityProgressEvent): ActivityState {
  const message = progressEventRules[event.type](currentState, event);
  if (message !== undefined) {
    throw new Error(message);
  }
  return currentState;
}

type LifecycleEventRule = (currentState: ActivityState, event: ActivityLifecycleEvent) => string | undefined;

const lifecycleEventRules: Partial<Record<ActivityLifecycleEvent['type'], LifecycleEventRule>> = {
  error: (_, event) => {
    const code = (event as { code?: unknown }).code;
    return typeof code === 'string' && code.trim() !== ''
      ? undefined
      : 'Error events require a stable code';
  },
  start: (currentState) =>
    currentState === 'paused'
      ? `Start events cannot resume a paused activity (state: ${currentState})`
      : undefined,
  resume: (currentState) =>
    currentState !== 'paused'
      ? `Resume events require paused state (state: ${currentState})`
      : undefined,
};

function validateLifecycleEvent(currentState: ActivityState, event: ActivityLifecycleEvent): void {
  const message = lifecycleEventRules[event.type]?.(currentState, event);
  if (message !== undefined) {
    throw new Error(message);
  }
}

function applyLifecycleEvent(
  lifecycle: ActivityLifecycle,
  currentState: ActivityState,
  event: ActivityLifecycleEvent,
): ActivityState {
  const target = EVENT_TARGET[event.type];
  if (target === undefined) {
    throw new Error(`Unknown activity event type: ${event.type}`);
  }
  validateLifecycleEvent(currentState, event);
  if (event.type === 'reset' && currentState === 'idle') {
    assertTransition(lifecycle, currentState, currentState);
    return currentState;
  }
  assertTransition(lifecycle, currentState, target);
  return target;
}

function isActivityEvent(value: unknown): value is ActivityEvent {
  return typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string';
}

function isProgressEvent(event: ActivityEvent): event is ActivityProgressEvent {
  return PROGRESS_EVENT_TYPES.has(event.type as ActivityProgressEvent['type']);
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
