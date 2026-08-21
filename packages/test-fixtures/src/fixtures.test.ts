import { describe, expect, it } from 'vitest';
import { fixedClock, CHRISTMAS_EVE_2026 } from './clocks';
import { createDeterministicRoute } from './routes';
import { createDeterministicSnapshot } from './snapshots';
import { SnapshotSchema } from '@santa-tracker/contracts';

describe('@santa-tracker/test-fixtures', () => {
  it('produces deterministic clocks', () => {
    const clock = fixedClock(CHRISTMAS_EVE_2026);
    expect(clock().toISOString()).toBe(CHRISTMAS_EVE_2026);
    expect(clock().toISOString()).toBe(CHRISTMAS_EVE_2026);
  });

  it('produces valid deterministic snapshots', () => {
    const snapshot = createDeterministicSnapshot();
    const result = SnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(true);
  });

  it('route fixtures are internally consistent', () => {
    const route = createDeterministicRoute();
    expect(route.stops.length).toBeGreaterThan(1);
    const arrivals = route.stops.map((s) => Date.parse(s.arrivalIso));
    for (let i = 1; i < arrivals.length; i++) {
      expect(arrivals[i]! > arrivals[i - 1]!).toBe(true);
    }
  });
});

