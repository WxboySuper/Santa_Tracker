import { describe, expect, it } from 'vitest';
import { routeNodesToContractRoute } from '../route-bridge';
import { LegacyRouteFixtureSchema } from '@santa-tracker/contracts';
import { loadRouteNodesRaw } from '../locations';
import { generateRoute, type Candidate, DEFAULT_GENERATOR_LIMITS } from '../../../../../packages/route-engine/src/generate/generator';

const places: Candidate[] = Array.from({ length: 10 }, (_, index) => ({
  id: `test-${index}`, name: `Test ${index}`, country: `Country ${index}`, lat: index - 5, lng: index * 7,
  timezone: index % 2 ? 'Pacific/Kiritimati' : 'Etc/GMT+12', category: index % 2 ? 'hub' : 'cultural',
}));

describe('generated legacy route compatibility', () => {
  it('loads draft nodes and converts every one into the contract route', async () => {
    const generated = generateRoute(places, { ...DEFAULT_GENERATOR_LIMITS, total: places.length, weights: { hub: 50, cultural: 50 } });
    expect(LegacyRouteFixtureSchema.safeParse(generated.document).success).toBe(true);
    const rawNodes = await loadRouteNodesRaw(JSON.stringify(generated.document));
    const converted = routeNodesToContractRoute(rawNodes);
    expect(rawNodes).toHaveLength(places.length);
    expect(converted.route.stops).toHaveLength(places.length);
  });
});
