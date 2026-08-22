import type { LocationEntry } from "./locations";

function calculateTotalDurationMinutes(startTime?: string | null, endTime?: string | null): number {
  if (!startTime || !endTime) return 0;
  try {
    const s = new Date(startTime.replace("Z", "+00:00"));
    const e = new Date(endTime.replace("Z", "+00:00"));
    return Math.round((e.getTime() - s.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function makeSimulatedItem(loc: LocationEntry) {
  return {
    name: loc.name,
    latitude: loc.latitude ?? loc.lat,
    longitude: loc.longitude ?? loc.lng,
    utc_offset: loc.utc_offset ?? loc.timezone_offset,
    arrival_time: loc.arrival_time ?? null,
    departure_time: loc.departure_time ?? null,
    country: loc.country ?? loc.region ?? null,
    population: loc.population ?? null,
    priority: loc.priority ?? null,
    notes: loc.notes ?? null,
    is_stop: loc.is_stop ?? true,
    stop_duration: loc.stop_duration ?? null,
  };
}

function computeSummary(route: ReturnType<typeof makeSimulatedItem>[]) {
  const withTimes = route.filter(r => r.arrival_time && r.departure_time);
  if (withTimes.length > 0) {
    const start = withTimes[0]!.arrival_time!;
    const end = withTimes[withTimes.length - 1]!.departure_time!;
    return {
      total_locations: route.length,
      locations_with_timing: withTimes.length,
      start_time: start,
      end_time: end,
      total_duration_minutes: calculateTotalDurationMinutes(start, end),
    };
  }
  return {
    total_locations: route.length,
    locations_with_timing: 0,
    start_time: null,
    end_time: null,
    total_duration_minutes: 0,
  };
}

export function buildSimulatedFromLocations(all: LocationEntry[], locationIds?: number[] | null) {
  let filtered = all;
  if (locationIds != null) {
    if (!Array.isArray(locationIds)) throw new Error("location_ids must be a list");
    filtered = locationIds.map(i => all[i]).filter(Boolean) as LocationEntry[];
  }
  const sorted = [...filtered].sort((a, b) => {
    const tzA = a.utc_offset ?? a.timezone_offset ?? 0;
    const tzB = b.utc_offset ?? b.timezone_offset ?? 0;
    const diff = tzB - tzA;
    if (diff !== 0) return diff;
    return (a.priority ?? 2) - (b.priority ?? 2);
  });
  const simulated_route = sorted.map(makeSimulatedItem);
  const summary = computeSummary(simulated_route);
  return { simulated_route, summary };
}
