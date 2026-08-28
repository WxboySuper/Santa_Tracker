import { describe, expect, it } from 'vitest';
import { fixedClock, CHRISTMAS_EVE_2026 } from './clocks';
import { createDeterministicRoute } from './routes';
import { createDeterministicSnapshot } from './snapshots';
import { SnapshotSchema } from '@santa-tracker/contracts';
import { legacyAdventFixture, legacyRouteFixture } from './legacy';

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

  it('contains the complete validated 2025 route as an immutable fixture', () => {
    expect(legacyRouteFixture.meta.year).toBe(2025);
    expect(legacyRouteFixture.route_nodes).toHaveLength(185);
    expect(legacyRouteFixture.route_nodes[0]?.type).toBe('START');
    expect(legacyRouteFixture.route_nodes.at(-1)?.location.name).toBe('Honolulu');
    expect(Object.isFrozen(legacyRouteFixture)).toBe(true);
    expect(Object.isFrozen(legacyRouteFixture.route_nodes)).toBe(true);
    expect(Object.isFrozen(legacyRouteFixture.route_nodes[0]?.location)).toBe(true);
  });

  it('contains all Advent days while keeping payloads available only to day consumers', () => {
    expect(legacyAdventFixture.days.map(day => day.day)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1),
    );
    expect(legacyAdventFixture.days[0]?.payload).toEqual({ text: 'Content for day 1' });
    expect(Object.isFrozen(legacyAdventFixture.days)).toBe(true);
    expect(Object.isFrozen(legacyAdventFixture.days[0]?.payload)).toBe(true);
  });
});
