import { describe, expect, it } from 'vitest';
import { generateRoute, type Candidate, DEFAULT_GENERATOR_CONFIG } from './generator';

const candidates: Candidate[] = Array.from({ length: 25 }, (_, index) => ({
  id: `candidate-${index}`, name: `Place ${index}`, country: `Country ${index % 9}`,
  lat: index * 2 - 24, lng: index * 13 - 156, timezone: ['Pacific/Kiritimati', 'Pacific/Apia', 'Asia/Kathmandu', 'Asia/Kolkata', 'Etc/GMT+12'][index % 5] ?? 'UTC',
  category: ['hub', 'cultural', 'underserved', 'nature', 'special'][index % 5] ?? 'hub',
}));

describe('generateRoute', () => {
  it('creates repeatable output that passes route and geometry validation', () => {
    const config = { ...DEFAULT_GENERATOR_CONFIG, seed: 2026, total: 20, weights: { hub: 20, cultural: 20, underserved: 20, nature: 20, special: 20 }, maxSpeedKmh: 40000 };
    const first = generateRoute(candidates, config);
    const second = generateRoute(candidates, config);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.route.stops).toHaveLength(20);
    expect(first.report.count).toBe(20);
  });

  it('rejects an impossible quota instead of fabricating candidates', () => {
    expect(() => generateRoute(candidates.slice(0, 2), { ...DEFAULT_GENERATOR_CONFIG, total: 5, weights: { hub: 100 } })).toThrow();
  });
});
