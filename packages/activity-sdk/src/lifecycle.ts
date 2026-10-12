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

function applyProgressEvent(currentState: ActivityState, event: ActivityProgressEvent): ActivityState {
  if (event.type === 'score') {
    if (currentState !== 'playing' || !Number.isFinite(event.value)) {
      throw new Error(`Score events require a finite value while playing (state: ${currentState})`);
    }
    return currentState;
  }

  if (
    (currentState !== 'playing' && currentState !== 'completed') ||
    typeof event.achievementId !== 'string' ||
    event.achievementId.trim() === ''
  ) {
    throw new Error(
      `Achievement events require an id while playing or completed (state: ${currentState})`,
    );
  }
  return currentState;
}

function validateLifecycleEvent(currentState: ActivityState, event: ActivityLifecycleEvent): void {
  if (event.type === 'error' && (typeof event.code !== 'string' || event.code.trim() === '')) {
    throw new Error('Error events require a stable code');
  }
  if (event.type === 'start' && currentState === 'paused') {
    throw new Error(`Start events cannot resume a paused activity (state: ${currentState})`);
  }
  if (event.type === 'resume' && currentState !== 'paused') {
    throw new Error(`Resume events require paused state (state: ${currentState})`);
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

/** Apply one lifecycle, score, or achievement event without renderer coupling. */
export function applyActivityEvent(
  lifecycle: ActivityLifecycle,
  currentState: ActivityState,
  event: ActivityEvent,
): ActivityState {
  if (event == null || typeof event !== 'object' || typeof event.type !== 'string') {
    throw new Error('Invalid activity event');
  }

  if (event.type === 'score' || event.type === 'achievement') {
    return applyProgressEvent(currentState, event);
  }
  return applyLifecycleEvent(lifecycle, currentState, event);
}
