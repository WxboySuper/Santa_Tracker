import type { Route } from '@santa-tracker/contracts';
import type { LatLng } from '../geo';

export type Candidate = LatLng & {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2 code. */
  country: string;
  timezone: string;
  utcOffsetMinutes?: number;
  category: string;
  population?: number;
  worldCity?: boolean;
  source?: string;
  plannedMinute?: number;
  plannedArrivalUtc?: string;
};

export type RegionalMinimums = {
  westernNorthernEurope: number;
  australiaNewZealand: number;
  pacificIslands: number;
  africa: number;
  middleEast: number;
  arctic: number;
};

export type GeneratorConfig = {
  seed: number;
  total: number;
  weights: Record<string, number>;
  arrivalStartMinute: number;
  arrivalEndMinute: number;
  durationSeconds: number;
  targetLegSpeedKmh: number;
  maxLegSpeedKmh: number;
  maxCountryRun: number;
  maxStopsPerCountry: number;
  countryCaps: Record<string, number>;
  maxStopsPerUtcOffset: number;
  offsetCaps: Record<string, number>;
  minArrivalGapMinutes: number;
  maxArrivalGapMinutes: number;
  medianLegSpeedMinKmh: number;
  medianLegSpeedMaxKmh: number;
  p90LegSpeedMaxKmh: number;
  maxRouteDistanceKm: number;
  minStopSeparationKm: number;
  minimumStopsPerHour: number;
  hubCoreMinimum: number;
  hubPopulationCore: number;
  hubPopulationMinimum: number;
  maxAmericasPercent: number;
  maxSouthAmericaStops: number;
  regionalMinimums: RegionalMinimums;
  underservedCountries: string[];
  requiredCountries: string[];
  requiredStopIds: string[];
  openingStopIds: string[];
  arrivalAnchorMinutes: Record<string, number>;
  routeOrderIds?: string[];
  endStopId: string;
  uninhabitedIslandIds: string[];
  ownerDecisionIds: string[];
  generatedAt: string;
};

export type GeneratedRoute = {
  document: { meta: { year: number; route_version: string; generated_at: string }; route_nodes: Record<string, unknown>[] };
  route: Route;
  locations: Candidate[];
  report: RouteReport;
};

export type RouteLegReport = {
  from: string;
  to: string;
  km: number;
  kmh: number;
  gapMinutes: number;
  kind: 'launch' | 'delivery' | 'return';
  eastwardDegrees: number;
};

export type RouteReport = {
  seed: number;
  count: number;
  mix: Record<string, { count: number; target: number }>;
  continentBalance: Record<string, number>;
  subregionBalance: Record<string, number>;
  offsetBalance: Record<string, number>;
  hourly: { hour: number; count: number }[];
  legs: RouteLegReport[];
  longestLegs: RouteLegReport[];
  issues: string[];
  medianLegSpeedKmh: number;
  p90LegSpeedKmh: number;
  maxLegSpeedKmh: number;
  totalDistanceKm: number;
  eastwardLegsOverEightDegrees: number;
  uninhabitedIslandStops: number;
  lastDepartureUtc: string;
  routeEndUtc: string;
};

export const TAKEOFF_UTC = '2026-12-24T10:00:00.000Z';
export const NORTH_POLE = { lat: 80, lng: 180 } as const;

export const DEFAULT_GENERATOR_LIMITS: Omit<GeneratorConfig, 'weights'> = {
  seed: 2026,
  total: 160,
  arrivalStartMinute: 20,
  arrivalEndMinute: 180,
  durationSeconds: 60,
  targetLegSpeedKmh: 14_000,
  maxLegSpeedKmh: 25_000,
  maxCountryRun: 2,
  maxStopsPerCountry: 6,
  countryCaps: {},
  maxStopsPerUtcOffset: 8,
  offsetCaps: {},
  minArrivalGapMinutes: 4,
  maxArrivalGapMinutes: 40,
  medianLegSpeedMinKmh: 6_000,
  medianLegSpeedMaxKmh: 14_000,
  p90LegSpeedMaxKmh: 20_000,
  maxRouteDistanceKm: 245_000,
  minStopSeparationKm: 100,
  minimumStopsPerHour: 4,
  hubCoreMinimum: 42,
  hubPopulationCore: 1_500_000,
  hubPopulationMinimum: 250_000,
  maxAmericasPercent: 35,
  maxSouthAmericaStops: 20,
  regionalMinimums: {
    westernNorthernEurope: 14,
    australiaNewZealand: 8,
    pacificIslands: 6,
    africa: 22,
    middleEast: 8,
    arctic: 1,
  },
  underservedCountries: [],
  requiredCountries: [],
  requiredStopIds: [],
  openingStopIds: [],
  arrivalAnchorMinutes: {},
  endStopId: 'ne-1159150429',
  uninhabitedIslandIds: [],
  ownerDecisionIds: [],
  generatedAt: '2026-11-23T00:00:00.000Z',
};
