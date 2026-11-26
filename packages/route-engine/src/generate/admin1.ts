import type { Candidate } from './types';

const US_STATES_AND_DC = [
  'US-AL', 'US-AK', 'US-AZ', 'US-AR', 'US-CA', 'US-CO', 'US-CT', 'US-DE', 'US-DC', 'US-FL', 'US-GA',
  'US-HI', 'US-ID', 'US-IL', 'US-IN', 'US-IA', 'US-KS', 'US-KY', 'US-LA', 'US-ME', 'US-MD', 'US-MA',
  'US-MI', 'US-MN', 'US-MS', 'US-MO', 'US-MT', 'US-NE', 'US-NV', 'US-NH', 'US-NJ', 'US-NM', 'US-NY',
  'US-NC', 'US-ND', 'US-OH', 'US-OK', 'US-OR', 'US-PA', 'US-RI', 'US-SC', 'US-SD', 'US-TN', 'US-TX',
  'US-UT', 'US-VT', 'US-VA', 'US-WA', 'US-WV', 'US-WI', 'US-WY',
] as const;

const CANADA_PROVINCES_AND_TERRITORIES = [
  'CA-AB', 'CA-BC', 'CA-MB', 'CA-NB', 'CA-NL', 'CA-NT', 'CA-NS', 'CA-NU', 'CA-ON', 'CA-PE', 'CA-QC', 'CA-SK', 'CA-YT',
] as const;

const AUSTRALIA_STATES_AND_TERRITORIES = [
  'AU-ACT', 'AU-NSW', 'AU-NT', 'AU-QLD', 'AU-SA', 'AU-TAS', 'AU-VIC', 'AU-WA',
] as const;

export const REQUIRED_ADMIN1_UNITS = {
  US: US_STATES_AND_DC,
  CA: CANADA_PROVINCES_AND_TERRITORIES,
  AU: AUSTRALIA_STATES_AND_TERRITORIES,
} as const;

export type RequiredAdmin1Country = keyof typeof REQUIRED_ADMIN1_UNITS;
export type Admin1Coverage = Record<RequiredAdmin1Country, {
  covered: number;
  required: number;
  coveredCodes: string[];
  missingCodes: string[];
}>;

function coveredAdmin1Codes(places: Candidate[]): Set<string> {
  return new Set(places.flatMap((place) => {
    const unit = admin1UnitFor(place);
    return unit ? [unit] : [];
  }));
}

export function admin1Coverage(places: Candidate[]): Admin1Coverage {
  const covered = coveredAdmin1Codes(places);
  return Object.fromEntries(Object.entries(REQUIRED_ADMIN1_UNITS).map(([country, units]) => {
    const coveredCodes = units.filter((code) => covered.has(code));
    const missingCodes = units.filter((code) => !covered.has(code));
    return [country, { covered: coveredCodes.length, required: units.length, coveredCodes: [...coveredCodes], missingCodes: [...missingCodes] }];
  })) as Admin1Coverage;
}

export function admin1UnitFor(place: Candidate): string | undefined {
  const country = place.country as RequiredAdmin1Country;
  const units: readonly string[] | undefined = REQUIRED_ADMIN1_UNITS[country];
  if (!units) return undefined;
  const code = place.admin1Code;
  if (!code) return undefined;
  if (!code.startsWith(`${country}-`)) return undefined;
  return units.includes(code) ? code : undefined;
}
