import { describe, expect, it } from 'vitest';
import { applyActivityEvent, canTransition, DEFAULT_LIFECYCLE } from './lifecycle';

describe('@santa-tracker/activity-sdk', () => {
  it('allows valid transitions', () => {
    expect(canTransition(DEFAULT_LIFECYCLE, 'idle', 'loading')).toBe(true);
    expect(canTransition(DEFAULT_LIFECYCLE, 'playing', 'completed')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(canTransition(DEFAULT_LIFECYCLE, 'idle', 'playing')).toBe(false);
    expect(canTransition(DEFAULT_LIFECYCLE, 'completed', 'playing')).toBe(false);
  });

  it('maps start, pause, resume, reset, complete, error, and exit to lifecycle states', () => {
    expect(applyActivityEvent(DEFAULT_LIFECYCLE, 'idle', { type: 'load' })).toBe('loading');
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
      /Invalid transition/,
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
      /cannot resume/,
    );
    expect(() => applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', { type: 'bogus' } as never)).toThrow(
      /Invalid activity event/,
    );
    expect(() => applyActivityEvent(DEFAULT_LIFECYCLE, 'playing', null as never)).toThrow(
      /Invalid activity event/,
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
    expect(canTransition(null as never, 'idle', 'loading')).toBe(false);
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
});
