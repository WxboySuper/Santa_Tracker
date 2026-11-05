import { describe, expect, it } from 'vitest';
import { generateRoute, type Candidate, DEFAULT_GENERATOR_LIMITS } from './generator';

const candidates: Candidate[] = Array.from({ length: 25 }, (_, index) => ({
  id: `candidate-${index}`, name: `Place ${index}`, country: `Country ${index % 9}`,
  lat: index * 2 - 24, lng: index * 13 - 156, timezone: ['Pacific/Kiritimati', 'Pacific/Apia', 'Asia/Kathmandu', 'Asia/Kolkata', 'Etc/GMT+12'][index % 5] ?? 'UTC',
  category: ['hub', 'cultural', 'underserved', 'nature', 'special'][index % 5] ?? 'hub',
}));

describe('generateRoute', () => {
  it('creates repeatable output that passes route and geometry validation', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, seed: 2026, total: 20, weights: { hub: 20, cultural: 20, underserved: 20, nature: 20, special: 20 }, maxSpeedKmh: 40000 };
    const inputIds = candidates.map((place) => place.id);
    const first = generateRoute(candidates, config);
    const second = generateRoute(candidates, config);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.route.stops).toHaveLength(20);
    expect(first.report.count).toBe(20);
    expect(first.locations.some((place) => place.id.includes('~'))).toBe(false);
    expect(candidates.map((place) => place.id)).toContain(first.locations[0]?.id);
    expect(candidates.map((place) => place.id)).toEqual(inputIds);
    expect(first.locations.every((place, index) => {
      const stop = first.route.stops[index];
      if (!stop) return false;
      const local = new Intl.DateTimeFormat('en-GB', { timeZone: place.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(stop.arrivalIso));
      const [hour, minute] = local.split(':').map(Number);
      const arrivalMinute = (hour ?? 0) * 60 + (minute ?? 0);
      return arrivalMinute >= config.arrivalStartMinute && arrivalMinute <= config.arrivalEndMinute;
    })).toBe(true);
    let longestCountryRun = 0;
    let currentCountryRun = 0;
    first.locations.forEach((place, index) => {
      currentCountryRun = index > 0 && place.country === first.locations[index - 1]?.country
        ? currentCountryRun + 1
        : 1;
      longestCountryRun = Math.max(longestCountryRun, currentCountryRun);
    });
    expect(longestCountryRun).toBeLessThanOrEqual(config.maxCountryRun);
  });

  it('rejects an impossible quota instead of fabricating candidates', () => {
    expect(() => generateRoute(candidates.slice(0, 2), { ...DEFAULT_GENERATOR_LIMITS, total: 5, weights: { hub: 100 } })).toThrow();
  });
});
