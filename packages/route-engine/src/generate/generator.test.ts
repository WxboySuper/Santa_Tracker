import { describe, expect, it } from 'vitest';
import { generateRoute, type Candidate, DEFAULT_GENERATOR_LIMITS } from './generator';

const testCountries = ['US', 'CA', 'MX', 'BZ', 'GT', 'HN', 'PA', 'SV', 'AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'PE', 'PY', 'SR', 'VE', 'AU', 'NZ', 'FJ', 'WS', 'GB', 'FR', 'JP'];
const candidates: Candidate[] = Array.from({ length: 25 }, (_, index) => ({
  id: `candidate-${index}`, name: `Place ${index}`, country: testCountries[index] ?? 'US',
  lat: 80, lng: index * 2, timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840,
  population: index % 5 === 0 ? 2_000_000 : index % 5 === 2 ? 0 : 500_000,
  category: ['hub', 'cultural', 'underserved', 'nature', 'special'][index % 5] ?? 'hub',
}));

describe('generateRoute', () => {
  it('creates repeatable output that passes route and geometry validation', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, seed: 2026, total: 20, endStopId: candidates[0]!.id, openingStopIds: [candidates[1]!.id], maxStopsPerUtcOffset: 40, minStopSeparationKm: 0, underservedCountries: [testCountries[2]!, testCountries[7]!, testCountries[12]!, testCountries[17]!, testCountries[22]!], weights: { hub: 20, cultural: 20, underserved: 20, nature: 20, special: 20 }, maxLegSpeedKmh: 40000 };
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
  }, 30_000);

  it('rejects an impossible quota instead of fabricating candidates', () => {
    expect(() => generateRoute(candidates.slice(0, 2), { ...DEFAULT_GENERATOR_LIMITS, total: 5, weights: { hub: 100 } })).toThrow();
  });

  it('rejects a zero-stop route before creating an empty report', () => {
    expect(() => generateRoute(candidates, { ...DEFAULT_GENERATOR_LIMITS, total: 0, weights: { hub: 1 } })).toThrow(/Invalid stop total/);
  });

  it('rejects invalid schedule and travel limits before generating stops', () => {
    const config = { ...DEFAULT_GENERATOR_LIMITS, total: 1, endStopId: candidates[0]!.id, weights: { hub: 1 } };
    expect(() => generateRoute(candidates, { ...config, arrivalStartMinute: 181, arrivalEndMinute: 180 })).toThrow(/arrival window/);
    expect(() => generateRoute(candidates, { ...config, durationSeconds: 0 })).toThrow(/stop duration/);
    expect(() => generateRoute(candidates, { ...config, maxLegSpeedKmh: -1 })).toThrow(/Invalid maximum leg speed/);
    expect(() => generateRoute(candidates, { ...config, maxCountryRun: 0 })).toThrow(/country run limit/);
    expect(() => generateRoute(candidates, { ...config, minArrivalGapMinutes: 0 })).toThrow(/minimum arrival gap/);
  });

  it('rejects a route that exceeds the configured speed ceiling', () => {
    const farApart = [
      { ...candidates[0]!, id: 'far-a', name: 'Far A', timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 2_000_000, lat: 0, lng: 0, category: 'hub' },
      { ...candidates[1]!, id: 'far-b', name: 'Far B', timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 2_000_000, lat: 0, lng: 180, category: 'hub' },
    ];
    const config = { ...DEFAULT_GENERATOR_LIMITS, total: 2, endStopId: 'far-b', openingStopIds: ['far-a'], maxStopsPerUtcOffset: 40, minStopSeparationKm: 0, weights: { hub: 1 }, arrivalEndMinute: 180, maxArrivalGapMinutes: 80, targetLegSpeedKmh: 20000, maxLegSpeedKmh: 1000 };
    expect(() => generateRoute(farApart, config)).toThrow(/No route ordering satisfies/);
  });

  it('reorders a sparse same-window pool and retimes its long jump under the ceiling', () => {
    const pool = [
      { ...candidates[0]!, id: 'balcarce', name: 'Balcarce', country: 'AR', timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 2_000_000, category: 'hub', lat: 50, lng: -58.25 },
      { ...candidates[1]!, id: 'churchill-falls', name: 'Churchill Falls', country: 'CA', timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 2_000_000, category: 'hub', lat: 53.52, lng: -64.01 },
      { ...candidates[2]!, id: 'st-johns', name: 'St Johns', country: 'CA', timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 2_000_000, category: 'hub', lat: 47.56, lng: -52.71 },
    ];
    const config = { ...DEFAULT_GENERATOR_LIMITS, total: 3, endStopId: 'st-johns', openingStopIds: ['balcarce'], maxStopsPerUtcOffset: 40, weights: { hub: 1 }, minStopSeparationKm: 0 };
    const generated = generateRoute(pool, config);

    expect(generated.report.maxLegSpeedKmh).toBeLessThanOrEqual(config.maxLegSpeedKmh);
    expect(generated.report.mix.hub).toEqual({ count: 3, target: 3 });
    expect(generated.report.legs).toHaveLength(4);
    expect(generateRoute(pool, config).route).toEqual(generated.route);
  });

  it('starts the next arrival after travel from the prior departure without adding dwell twice', () => {
    const firstCandidate = candidates[0];
    const secondCandidate = candidates[1];
    if (!firstCandidate || !secondCandidate) throw new Error('Expected test candidates');
    const colocated = [
      { ...firstCandidate, id: 'close-a', timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 2_000_000, category: 'hub', lat: 80, lng: 0 },
      { ...secondCandidate, id: 'close-b', timezone: 'Pacific/Kiritimati', utcOffsetMinutes: 840, population: 2_000_000, category: 'hub', lat: 80, lng: 0.01 },
    ];
    const config = { ...DEFAULT_GENERATOR_LIMITS, total: 2, endStopId: 'close-b', openingStopIds: ['close-a'], maxStopsPerUtcOffset: 40, weights: { hub: 1 }, arrivalStartMinute: 20, arrivalEndMinute: 80, minStopSeparationKm: 0 };
    const generated = generateRoute(colocated, config);
    const prior = generated.route.stops[0];
    const next = generated.route.stops[1];
    if (!prior || !next) throw new Error('Expected two generated stops');
    expect(Date.parse(next.arrivalIso) - Date.parse(prior.arrivalIso)).toBeGreaterThanOrEqual(config.minArrivalGapMinutes * 60_000);
  });
});
