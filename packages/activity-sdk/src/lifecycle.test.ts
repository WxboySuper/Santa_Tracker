import { describe, expect, it } from 'vitest';
import { canTransition, DEFAULT_LIFECYCLE } from './lifecycle';

describe('@santa-tracker/activity-sdk', () => {
  it('allows valid transitions', () => {
    expect(canTransition(DEFAULT_LIFECYCLE, 'idle', 'loading')).toBe(true);
    expect(canTransition(DEFAULT_LIFECYCLE, 'playing', 'completed')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(canTransition(DEFAULT_LIFECYCLE, 'idle', 'playing')).toBe(false);
    expect(canTransition(DEFAULT_LIFECYCLE, 'completed', 'playing')).toBe(false);
  });
});

