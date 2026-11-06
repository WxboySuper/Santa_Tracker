import type { Route } from '@santa-tracker/contracts';
import type { LatLng } from '../geo';

export type Candidate = LatLng & {
  id: string; name: string; country: string; timezone: string; category: string;
  population?: number; worldCity?: boolean; source?: string; region?: string; plannedMinute?: number;
};
export type GeneratorConfig = {
  seed: number; total: number; weights: Record<string, number>; arrivalStartMinute: number;
  arrivalEndMinute: number; durationSeconds: number; maxSpeedKmh: number; maxGapKm: number;
  maxLegSpeedKmh: number;
  maxCountryRun: number; minimumStopsPerHour: number; westernHours: number;
  allowFastLegs?: boolean;
};
export type GeneratedRoute = {
  document: { meta: { year: number; route_version: string; generated_at: string }; route_nodes: Record<string, unknown>[] };
  route: Route; locations: Candidate[]; report: RouteReport;
};
export type RouteReport = {
  seed: number; count: number; mix: Record<string, { count: number; target: number }>;
  regionBalance: Record<string, number>;
  hourly: { hour: number; count: number }[]; fastestLeg: { from: string; to: string; km: number; kmh: number; longGap: boolean } | null;
  longestLegs: { from: string; to: string; km: number; kmh: number }[]; flags: { longGap: number; fastLeg: number; repeatCountry: number }[];
  issues: string[]; westernMinimum: number;
  maxLegSpeedKmh: number; legsAbove15000Kmh: number; speedWarnings: string[];
  reorderedStops: number; replacedStops: number;
};
export const DEFAULT_GENERATOR_LIMITS: Omit<GeneratorConfig, 'weights'> = {
  seed: 2026, total: 160,
  arrivalStartMinute: 20, arrivalEndMinute: 180, durationSeconds: 60, maxSpeedKmh: 40_000,
  maxLegSpeedKmh: 25_000,
  maxGapKm: 1200, maxCountryRun: 8, minimumStopsPerHour: 4, westernHours: 8,
};
