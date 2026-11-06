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

  it('rejects a zero-stop route before creating an empty report', () => {
    expect(() => generateRoute(candidates, { ...DEFAULT_GENERATOR_LIMITS, total: 0, weights: { hub: 1 } })).toThrow(/Invalid stop total/);
  });

  it('rejects invalid schedule and travel limits before generating stops', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, total: 1, weights: { hub: 1 } };
    expect(() => generateRoute(candidates, { ...config, arrivalStartMinute: 181, arrivalEndMinute: 180 })).toThrow(/arrival window/);
    expect(() => generateRoute(candidates, { ...config, durationSeconds: 0 })).toThrow(/stop duration/);
    expect(() => generateRoute(candidates, { ...config, maxSpeedKmh: 0 })).toThrow(/maximum speed/);
    expect(() => generateRoute(candidates, { ...config, maxGapKm: Number.NaN })).toThrow(/maximum gap/);
    expect(() => generateRoute(candidates, { ...config, maxCountryRun: 0 })).toThrow(/country run limit/);
    expect(() => generateRoute(candidates, { ...config, westernHours: -1 })).toThrow(/western hour count/);
  });

  it('starts the next arrival after travel from the prior departure without adding dwell twice', () => {
    const colocated = [
      { ...candidates[0]!, id: 'close-a', timezone: 'UTC', category: 'hub', lat: 0, lng: 0 },
      { ...candidates[1]!, id: 'close-b', timezone: 'UTC', category: 'hub', lat: 0, lng: 0 },
    ];
    const config = { ...DEFAULT_GENERATOR_LIMITS, total: 2, weights: { hub: 1 }, arrivalStartMinute: 20, arrivalEndMinute: 80 };
    const generated = generateRoute(colocated, config);
    const prior = generated.route.stops[0];
    const next = generated.route.stops[1];
    if (!prior || !next) throw new Error('Expected two generated stops');
    expect(Date.parse(next.arrivalIso) - Date.parse(prior.departureIso)).toBe(1);
  });
});
