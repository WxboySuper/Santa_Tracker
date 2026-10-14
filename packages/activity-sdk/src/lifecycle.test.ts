import { describe, expect, it } from 'vitest';
import {
  ActivityLifecycleError,
  applyActivityEvent,
  assertTransition,
  canTransition,
  DEFAULT_LIFECYCLE,
  type ActivityLifecycle,
} from './lifecycle';

describe('@santa-tracker/activity-sdk', () => {
  it('allows valid transitions', () => {
    expect(canTransition(DEFAULT_LIFECYCLE, 'idle', 'loading')).toBe(true);
    expect(canTransition(DEFAULT_LIFECYCLE, 'playing', 'completed')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(canTransition(DEFAULT_LIFECYCLE, 'idle', 'playing')).toBe(false);
    expect(canTransition(DEFAULT_LIFECYCLE, 'idle', 'idle')).toBe(false);
    expect(canTransition(DEFAULT_LIFECYCLE, 'completed', 'playing')).toBe(false);
    expect(canTransition(DEFAULT_LIFECYCLE, 'failed', 'idle')).toBe(true);
    expect(() => assertTransition(DEFAULT_LIFECYCLE, 'failed', 'idle')).not.toThrow();
  });

  it('maps load completion and other lifecycle events to lifecycle states', () => {
    expect(applyActivityEvent(DEFAULT_LIFECYCLE, 'idle', { type: 'load' })).toBe('loading');
    expect(applyActivityEvent(DEFAULT_LIFECYCLE, 'loading', { type: 'loaded' })).toBe('ready');
    expect(applyActivityEvent(DEFAULT_LIFECYCLE, 'ready', { type: 'start' })).toBe('playing');
    expect(applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', { type: 'pause' })).toBe('paused');
    expect(applyActivityEvent(DEFAULT_LIFECYCLE, 'paused', { type: 'resume' })).toBe('playing');
    expect(applyActivityEvent(DEFAULT_LIFECYCLE, 'completed', { type: 'reset' })).toBe('ready');
    expect(applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', { type: 'complete' })).toBe(
      'completed',
    );
    expect(
      applyActivityEvent(DEFAULT_LIFECYCLE, 'loading', { type: 'error', code: 'asset-load' }),
    ).toBe('failed');
    expect(applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', { type: 'exit' })).toBe('exited');
  });

  it('accepts finite scores while playing without changing lifecycle state', () => {
    expect(applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', { type: 'score', value: 42 })).toBe(
      'playing',
    );
  });

  it('accepts achievements during play and completion', () => {
    expect(
      applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', {
        type: 'achievement',
        achievementId: 'first-star',
      }),
    ).toBe('playing');
    expect(
      applyActivityEvent(DEFAULT_LIFECYCLE, 'completed', {
        type: 'achievement',
        achievementId: 'perfect-run',
      }),
    ).toBe('completed');
  });

  it('rejects invalid progress events and lifecycle actions', () => {
    expect(() =>
      applyActivityEvent(DEFAULT_LIFECYCLE, 'ready', { type: 'score', value: 1 }),
    ).toThrow();
    expect(() =>
      applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', { type: 'score', value: Number.NaN }),
    ).toThrow();
    expect(() =>
      applyActivityEvent(DEFAULT_LIFECYCLE, 'ready', { type: 'achievement', achievementId: '   ' }),
    ).toThrow();
    expect(() => applyActivityEvent(DEFAULT_LIFECYCLE, 'idle', { type: 'start' })).toThrow(
      /Start events require ready state/,
    );
    expect(() => applyActivityEvent(DEFAULT_LIFECYCLE, 'ready', { type: 'loaded' })).toThrow(
      /Loaded events require loading state/,
    );
    expect(() => applyActivityEvent(DEFAULT_LIFECYCLE, 'loading', { type: 'reset' })).toThrow(
      /Reset events are not valid while loading/,
    );
    expect(() =>
      applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', { type: 'error', code: '  ' }),
    ).toThrow(/require a stable code/);
  });

  it('rejects invalid runtime event shapes and distinguishes start from resume', () => {
    expect(() => applyActivityEvent(DEFAULT_LIFECYCLE, 'ready', { type: 'resume' } as never)).toThrow(
      /Resume events require paused state/,
    );
    expect(() => applyActivityEvent(DEFAULT_LIFECYCLE, 'paused', { type: 'start' })).toThrow(
      /require ready state/,
    );
    expect(() => applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', { type: 'bogus' } as never)).toThrow(
      /Invalid activity event/,
    );
    expect(() => applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', null as never)).toThrow(
      /Invalid activity event/,
    );
  });

  it('keeps lifecycle event rules even when a custom graph is permissive', () => {
    const permissive: ActivityLifecycle = {
      ...DEFAULT_LIFECYCLE,
      transitions: {
        ...DEFAULT_LIFECYCLE.transitions,
        idle: ['loading', 'playing', 'paused', 'completed', 'failed', 'exited'],
      },
    };

    expect(() => applyActivityEvent(permissive, 'idle', { type: 'start' })).toThrow(
      /Start events require ready state/,
    );
    expect(() => applyActivityEvent(permissive, 'idle', { type: 'pause' })).toThrow(
      /Pause events require playing state/,
    );
    expect(() => applyActivityEvent(permissive, 'idle', { type: 'complete' })).toThrow(
      /Complete events require playing state/,
    );
  });

  it('treats reset from idle as a no-op independent of custom graphs and permits repeated exit', () => {
    const custom = { ...DEFAULT_LIFECYCLE, transitions: { ...DEFAULT_LIFECYCLE.transitions, idle: [] } };
    expect(applyActivityEvent(custom, 'idle', { type: 'reset' })).toBe('idle');
    expect(applyActivityEvent(DEFAULT_LIFECYCLE, 'exited', { type: 'exit' })).toBe('exited');
  });

  it('maps error events to failed from every state', () => {
    for (const state of [
      'idle',
      'loading',
      'ready',
      'playing',
      'paused',
      'completed',
      'failed',
      'exited',
    ] as const) {
      expect(applyActivityEvent(DEFAULT_LIFECYCLE, state, { type: 'error', code: 'boom' })).toBe(
        'failed',
      );
    }
  });

  it('rejects malformed lifecycles as configuration errors, not transition failures', () => {
    expect(() =>
      applyActivityEvent(null as never, 'idle', { type: 'load' }),
    ).toThrow(/Invalid lifecycle configuration/);
    expect(() =>
      applyActivityEvent(
        { ...DEFAULT_LIFECYCLE, transitions: { ...DEFAULT_LIFECYCLE.transitions, idle: 'loading' } } as never,
        'idle',
        { type: 'load' },
      ),
    ).toThrow(/Invalid lifecycle configuration/);
    expect(() => canTransition(null as never, 'idle', 'loading')).toThrow(
      ActivityLifecycleError,
    );
  });

  it('accepts legacy custom graphs that omit the newly added exited state', () => {
    const { exited: _exited, ...currentStates } = DEFAULT_LIFECYCLE.transitions;
    const legacyTransitions = Object.fromEntries(
      Object.entries(currentStates).map(([state, transitions]) => [
        state,
        transitions.filter(target => target !== 'exited'),
      ]),
    ) as ActivityLifecycle['transitions'];
    const legacyLifecycle: ActivityLifecycle = {
      ...DEFAULT_LIFECYCLE,
      transitions: legacyTransitions,
    };

    expect(canTransition(legacyLifecycle, 'ready', 'playing')).toBe(true);
    expect(applyActivityEvent(legacyLifecycle, 'ready', { type: 'start' })).toBe('playing');
    expect(() => applyActivityEvent(legacyLifecycle, 'idle', { type: 'exit' })).toThrow(
      /Invalid transition/,
    );
  });

  it('requires exited transitions when a custom graph can enter exited', () => {
    // @ts-expect-error A graph that can enter exited must define exited transitions.
    const invalidTransitions: ActivityLifecycle['transitions'] = {
      idle: ['loading', 'exited'],
      loading: ['ready'],
      ready: ['playing'],
      playing: ['paused'],
      paused: ['playing'],
      completed: ['ready'],
      failed: ['loading'],
    };
    expect(invalidTransitions.idle).toContain('exited');
  });

  it('reports stable lifecycle error codes', () => {
    try {
      applyActivityEvent(DEFAULT_LIFECYCLE, 'idle', { type: 'start' });
      throw new Error('Expected an invalid lifecycle event');
    } catch (error) {
      expect(error).toBeInstanceOf(ActivityLifecycleError);
      expect((error as ActivityLifecycleError).code).toBe('invalid_event');
    }
    try {
      assertTransition(DEFAULT_LIFECYCLE, 'idle', 'playing');
      throw new Error('Expected an invalid transition');
    } catch (error) {
      expect(error).toBeInstanceOf(ActivityLifecycleError);
      expect((error as ActivityLifecycleError).code).toBe('invalid_transition');
    }
  });

  it('rejects malformed known payloads and prototype-polluting event types', () => {
    expect(() =>
      applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', { type: 'score' } as never),
    ).toThrow(/Score events require/);
    expect(() =>
      applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', { type: 'error' } as never),
    ).toThrow(/stable code/);
    expect(() =>
      applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', { type: '__proto__' } as never),
    ).toThrow(/Invalid activity event/);
    expect(() =>
      applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', { type: 'toString' } as never),
    ).toThrow(/Invalid activity event/);
    expect(() => applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', [] as never)).toThrow(
      /Invalid activity event/,
    );
  });

  it('validates runtime states without inspecting the lifecycle graph for progress events', () => {
    expect(() =>
      applyActivityEvent(DEFAULT_LIFECYCLE, 'bogus' as never, { type: 'score', value: 1 }),
    ).toThrow(/Invalid activity state/);
    const malformed = {
      ...DEFAULT_LIFECYCLE,
      transitions: { ...DEFAULT_LIFECYCLE.transitions, failed: 'idle' },
    } as never;
    expect(applyActivityEvent(malformed, 'playing', { type: 'score', value: 1 })).toBe('playing');
  });
});
