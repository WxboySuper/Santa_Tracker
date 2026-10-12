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
});
