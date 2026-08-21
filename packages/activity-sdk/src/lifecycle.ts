export type ActivityState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'completed' | 'failed';

export type ActivityLifecycle = {
  id: string;
  initialState: ActivityState;
  transitions: Record<ActivityState, ActivityState[]>;
};

export const DEFAULT_LIFECYCLE: ActivityLifecycle = {
  id: 'default',
  initialState: 'idle',
  transitions: {
    idle: ['loading'],
    loading: ['ready', 'failed'],
    ready: ['playing'],
    playing: ['paused', 'completed', 'failed'],
    paused: ['playing', 'failed'],
    completed: ['ready'],
    failed: ['loading', 'idle'],
  },
};

export function canTransition(lifecycle: ActivityLifecycle, from: ActivityState, to: ActivityState): boolean {
  const allowed = lifecycle.transitions[from] ?? [];
  return allowed.includes(to);
}

export function assertTransition(lifecycle: ActivityLifecycle, from: ActivityState, to: ActivityState): void {
  if (!canTransition(lifecycle, from, to)) {
    throw new Error(`Invalid transition ${from} -> ${to} for lifecycle ${lifecycle.id}`);
  }
}
