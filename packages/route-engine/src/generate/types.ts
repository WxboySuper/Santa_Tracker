import type { Route } from '@santa-tracker/contracts';
import type { LatLng } from '../geo';
import type { Admin1Coverage } from './admin1';

export type StopTier = 'major' | 'city' | 'town' | 'hop';
export type EastwardReason = 'dateline' | 'offset-anomaly' | 'return';

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
  capital?: boolean;
  isCapital?: boolean;
  isNationalCapital?: boolean;
  headlineLandmark?: boolean;
  /** Natural Earth ISO 3166-2 first-order subdivision code where applicable. */
  admin1Code?: string | null;
  source?: string;
  plannedArrivalUtc?: string;
  plannedStopTier?: StopTier;
  plannedStopDurationSeconds?: number;
};

export type GeneratorConfig = {
  seed: number;
  weights: Record<string, number>;
  /** Local legs use a slower pace so dense regional chains take real flight time. */
  localLegSpeedKmh: number;
  targetLegSpeedKmh: number;
  maxLegSpeedKmh: number;
  p90LegSpeedMaxKmh: number;
  minStopSeparationKm: number;
  /** Limits optional dense fill; mandatory country, admin-1, and offset-band coverage may exceed it. */
  maxStopsPerCountry: number;
  underservedCountries: string[];
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
  eastwardReason?: EastwardReason;
};

export type RouteDetourReport = {
  via: string;
  viaCountry: string;
  viaCountryStopCount: number;
  from: string;
  to: string;
  ratio: number;
};

export type RouteReport = {
  seed: number;
  count: number;
  candidateCount: number;
  invalidCandidateIds: string[];
  unselectedCandidateCount: number;
  countriesCovered: number;
  countryCodes: string[];
  uncoveredCountryCodes: string[];
  uncoveredCountryReasons: { code: string; candidateCount: number; reason: string }[];
  admin1Coverage: Admin1Coverage;
  mix: Record<string, number>;
  stopTiers: Record<StopTier, number>;
  continentBalance: Record<string, number>;
  subregionBalance: Record<string, number>;
  offsetBalance: Record<string, number>;
  offsetPopulationShare: Record<string, number>;
  offsetLandCoverageShare: Record<string, number>;
  hourly: { hour: number; count: number }[];
  localArrivalHistogram: Record<string, number>;
  localArrivalMin: string;
  localArrivalMax: string;
  shortDeliveryLegCount: number;
  deliveryLegCount: number;
  shareDeliveryLegsUnder300Km: number;
  subnationalCoverageNote: string;
  legs: RouteLegReport[];
  eastwardLegs: RouteLegReport[];
  detours: RouteDetourReport[];
  longestLegs: RouteLegReport[];
  issues: string[];
  medianLegSpeedKmh: number;
  p90LegSpeedKmh: number;
  maxLegSpeedKmh: number;
  totalDistanceKm: number;
  populationWithin500Km: number;
  worldPopulationEstimate: number;
  populationCoverageWithin500Km: number;
  lastDepartureUtc: string;
  routeEndUtc: string;
};

export const TAKEOFF_UTC = '2026-12-24T10:00:00.000Z';
export const RETURN_DEADLINE_UTC = '2026-12-25T14:00:00.000Z';
export const NORTH_POLE = { lat: 80, lng: 180 } as const;

export const DEFAULT_GENERATOR_LIMITS: GeneratorConfig = {
  seed: 2026,
  weights: { hub: 30, cultural: 27.5, underserved: 25, nature: 12, special: 5.5, populated: 0 },
  localLegSpeedKmh: 4_000,
  targetLegSpeedKmh: 19_000,
  maxLegSpeedKmh: 25_000,
  p90LegSpeedMaxKmh: 20_000,
  minStopSeparationKm: 20,
  maxStopsPerCountry: 12,
  underservedCountries: [],
  generatedAt: '2026-11-23T00:00:00.000Z',
};
