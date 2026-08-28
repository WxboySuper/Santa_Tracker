import {
  LegacyAdventFixtureSchema,
  LegacyRouteFixtureSchema,
  type LegacyAdventFixture,
  type LegacyRouteFixture,
} from '@santa-tracker/contracts';
import adventCalendarSource from './data/advent-calendar-2024.json';
import routeSource from './data/santa-route-2025.json';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** The unmodified 2025 route, checked once before test code can use it. */
export const legacyRouteFixture: Readonly<LegacyRouteFixture> = deepFreeze(
  LegacyRouteFixtureSchema.parse(routeSource),
);

/** The unmodified Advent manifest, checked once before test code can use it. */
export const legacyAdventFixture: Readonly<LegacyAdventFixture> = deepFreeze(
  LegacyAdventFixtureSchema.parse(adventCalendarSource),
);

export function getLegacyRouteFixture(): Readonly<LegacyRouteFixture> {
  return legacyRouteFixture;
}

export function getLegacyAdventFixture(): Readonly<LegacyAdventFixture> {
  return legacyAdventFixture;
}
