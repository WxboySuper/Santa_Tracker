import {
  LegacyAdventFixtureSchema,
  LegacyRouteFixtureSchema,
  type LegacyAdventFixture,
  type LegacyRouteFixture,
} from '@santa-tracker/contracts';
import adventCalendarSource from './data/advent-calendar-2024.json';
import routeSource from './data/santa-route-2025.json';

function isObjectLike(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

function deepFreeze<T>(value: T): T {
  if (!isObjectLike(value)) return value;
  if (Object.isFrozen(value)) return value;

  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

/** SHA-256 values of the source files copied into these fixtures. */
export const LEGACY_SOURCE_SHA256 = {
  route: '25a3222d49daf14726ece485d00684f47013099a730cac5927b47be40ab22917',
  advent: 'b8e8212cc75d3bca0a110756fde7f8a10b213f1efec35fa3214a9e394552be2f',
} as const;

/** The unmodified 2025 route, checked once before test code can use it. */
export const legacyRouteFixture: Readonly<LegacyRouteFixture> = deepFreeze(
  LegacyRouteFixtureSchema.parse(routeSource),
);

/** The unmodified Advent manifest, checked once before test code can use it. */
export const legacyAdventFixture: Readonly<LegacyAdventFixture> = deepFreeze(
  LegacyAdventFixtureSchema.parse(adventCalendarSource),
);
