import type { Candidate } from './types';
import requiredAdmin1Units from './admin1-units.json';

export const REQUIRED_ADMIN1_UNITS = requiredAdmin1Units;
// These valid external codes are preserved in candidate data, but are not
// part of the owner's required state/province/territory coverage set.
const OPTIONAL_EXTERNAL_ADMIN1_CODES: Partial<Record<RequiredAdmin1Country, readonly string[]>> = {
  US: ['US-PR'],
  AU: ['AU-X03~'],
};

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
  if (typeof place.country !== 'string') return undefined;
  const country = place.country.trim().toUpperCase() as RequiredAdmin1Country;
  const units: readonly string[] | undefined = REQUIRED_ADMIN1_UNITS[country];
  if (!units) return undefined;
  const code = place.admin1Code?.trim().toUpperCase();
  if (!code) return undefined;
  if (!code.startsWith(`${country}-`)) return undefined;
  return units.includes(code) || OPTIONAL_EXTERNAL_ADMIN1_CODES[country]?.includes(code) ? code : undefined;
}
