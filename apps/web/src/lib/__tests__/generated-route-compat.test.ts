import { describe, expect, it } from 'vitest';
import { routeNodesToContractRoute } from '../route-bridge';
import { LegacyRouteFixtureSchema } from '@santa-tracker/contracts';
import { loadRouteNodesRaw } from '../locations';
import { generateRoute, type Candidate, DEFAULT_GENERATOR_LIMITS } from '../../../../../packages/route-engine/src/generate/generator';

const places: Candidate[] = Array.from({ length: 10 }, (_, index) => ({
  id: `test-${index}`, name: `Test ${index}`, country: `A${String.fromCharCode(65 + index)}`, lat: 80, lng: index * 2,
  timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 2_000_000, category: index % 2 ? 'hub' : 'cultural',
}));

describe('generated legacy route compatibility', () => {
  it('loads draft nodes and converts every one into the contract route', async () => {
    const generated = generateRoute(places, { ...DEFAULT_GENERATOR_LIMITS, total: places.length, endStopId: 'test-1', openingStopIds: ['test-0'], maxStopsPerUtcOffset: 40, minStopSeparationKm: 0, weights: { hub: 50, cultural: 50 } });
    expect(LegacyRouteFixtureSchema.safeParse(generated.document).success).toBe(true);
    const rawNodes = await loadRouteNodesRaw(JSON.stringify(generated.document));
    const converted = routeNodesToContractRoute(rawNodes);
    expect(rawNodes).toHaveLength(places.length + 2);
    expect(rawNodes[0]?.type).toBe('START');
    expect(rawNodes.at(-1)?.type).toBe('END');
    expect(converted.route.stops).toHaveLength(places.length);
  }, 15_000);
});
