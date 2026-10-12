import { describe, expect, it } from 'vitest';
import { completionEvent, failureEvent } from './telemetry';

describe('telemetry privacy', () => {
  it('keeps outcome payloads free of identity fields', () => {
    for (const event of [
      completionEvent('ornament-smash', { score: 10 }),
      failureEvent('ornament-smash', { reason: 'timeout' }),
    ]) {
      expect(event).not.toHaveProperty('name');
      expect(event).not.toHaveProperty('email');
      expect(event).not.toHaveProperty('userId');
      expect(event).not.toHaveProperty('identity');
    }
  });

  it('keeps authoritative fields last so details cannot override them', () => {
    expect(
      completionEvent('ornament-smash', { event: 'failed', activityId: 'other' } as never),
    ).toMatchObject({ activityId: 'ornament-smash', event: 'completed' });
    expect(
      failureEvent('ornament-smash', { event: 'completed', activityId: 'other' } as never),
    ).toMatchObject({ activityId: 'ornament-smash', event: 'failed' });
  });

  it('drops non-finite metrics, negative durations, and empty reasons', () => {
    expect(completionEvent('ornament-smash', { score: Number.NaN }).score).toBeUndefined();
    expect(completionEvent('ornament-smash', { score: Number.POSITIVE_INFINITY }).score).toBeUndefined();
    expect(completionEvent('ornament-smash', { durationMs: -1 }).durationMs).toBeUndefined();
    expect(failureEvent('ornament-smash', { durationMs: Number.NaN }).durationMs).toBeUndefined();
    expect(failureEvent('ornament-smash', { reason: '' }).reason).toBeUndefined();
    expect(failureEvent('ornament-smash', { reason: 42 as never }).reason).toBeUndefined();
  });

  it('trims activity ids and drops blank reasons', () => {
    expect(completionEvent('  ornament-smash  ', { score: 1 })).toMatchObject({ activityId: 'ornament-smash' });
    expect(failureEvent('ornament-smash', { reason: '   ' }).reason).toBeUndefined();
  });
  it('enforces discriminated payloads and non-empty activity ids', () => {
    expect(completionEvent('ornament-smash', { reason: 'timeout' } as never).reason).toBeUndefined();
    expect(failureEvent('ornament-smash', { score: 10 } as never).score).toBeUndefined();
    expect(() => completionEvent('')).toThrow();
    expect(() => failureEvent('   ')).toThrow();
  });
});
