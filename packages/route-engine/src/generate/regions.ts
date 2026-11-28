import type { Candidate } from './types';

const WESTERN_NORTHERN_EUROPE = new Set([
  'AT', 'BE', 'CH', 'DE', 'DK', 'ES', 'FI', 'FR', 'GB', 'IE', 'IS', 'IT', 'LU', 'NL', 'NO', 'PT', 'SE',
]);
const SOUTHERN_EASTERN_EUROPE = new Set([
  'AD', 'AL', 'BA', 'BG', 'BY', 'CY', 'CZ', 'EE', 'GR', 'HR', 'HU', 'LI', 'LT', 'LV', 'MC', 'MD', 'ME', 'MK',
  'MT', 'PL', 'RO', 'RS', 'RU', 'SI', 'SK', 'SM', 'UA', 'VA',
]);
const EUROPE = new Set([...WESTERN_NORTHERN_EUROPE, ...SOUTHERN_EASTERN_EUROPE]);
const MIDDLE_EAST = new Set(['AE', 'BH', 'IR', 'IQ', 'IL', 'JO', 'KW', 'LB', 'OM', 'PS', 'QA', 'SA', 'SY', 'TR', 'YE']);
const AFRICA = new Set([
  'AO', 'BF', 'BI', 'BJ', 'BW', 'CD', 'CF', 'CG', 'CI', 'CM', 'CV', 'DJ', 'DZ', 'EG', 'EH', 'ER', 'ET', 'GA', 'GH', 'GM', 'GN', 'GQ', 'GW', 'KE', 'KM', 'LR', 'LS', 'LY', 'MA', 'MG', 'ML', 'MR', 'MU', 'MW', 'MZ', 'NA', 'NE', 'NG', 'RW', 'SC', 'SD', 'SL', 'SN', 'SO', 'SS', 'ST', 'SZ', 'TD', 'TG', 'TN', 'TZ', 'UG', 'ZA', 'ZM', 'ZW',
]);
const SOUTH_AMERICA = new Set(['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PE', 'PY', 'SR', 'UY', 'VE']);
const NORTH_AMERICA = new Set([
  'AG', 'AI', 'AW', 'BB', 'BL', 'BM', 'BQ', 'BS', 'BZ', 'CA', 'CR', 'CU', 'CW', 'DM', 'DO', 'GD', 'GL', 'GP', 'GT', 'HN', 'HT', 'JM', 'KN', 'KY', 'LC', 'MF', 'MQ', 'MS', 'MX', 'NI', 'PA', 'PM', 'PR', 'SV', 'SX', 'TC', 'TT', 'US', 'VC', 'VG', 'VI',
]);
const OCEANIA = new Set(['AS', 'AU', 'CK', 'FJ', 'FM', 'GU', 'KI', 'MH', 'MP', 'NC', 'NU', 'NZ', 'PF', 'PG', 'PW', 'SB', 'TK', 'TO', 'TV', 'VU', 'WF', 'WS']);
const PACIFIC_ISLANDS = new Set(['AS', 'CK', 'FJ', 'FM', 'GU', 'KI', 'MH', 'MP', 'NC', 'NU', 'PF', 'PG', 'PW', 'SB', 'TK', 'TO', 'TV', 'VU', 'WF', 'WS']);
const WESTERN_ASIA = new Set(['AM', 'AZ', 'GE']);
const CENTRAL_ASIA = new Set(['KZ', 'KG', 'TJ', 'TM', 'UZ', 'RU']);
const EAST_ASIA = new Set(['CN', 'HK', 'JP', 'KP', 'KR', 'MO', 'MN', 'TW']);
const SOUTH_ASIA = new Set(['AF', 'BD', 'BT', 'IN', 'MV', 'NP', 'PK', 'LK']);
const SOUTHEAST_ASIA = new Set(['BN', 'ID', 'KH', 'LA', 'MM', 'MY', 'PH', 'SG', 'TH', 'TL', 'VN']);
const CENTRAL_AMERICA = new Set(['BZ', 'CR', 'GT', 'HN', 'NI', 'PA', 'SV']);
const CARIBBEAN = new Set(['AG', 'AI', 'AW', 'BB', 'BL', 'BM', 'BQ', 'BS', 'CU', 'CW', 'DM', 'DO', 'GD', 'GP', 'HT', 'JM', 'KN', 'KY', 'LC', 'MF', 'MQ', 'MS', 'PR', 'SX', 'TC', 'TT', 'VC', 'VG', 'VI']);
const NORTHERN_AMERICA = new Set([...NORTH_AMERICA].filter((code) => !CENTRAL_AMERICA.has(code) && !CARIBBEAN.has(code) && code !== 'GL'));
const ASIA = new Set([...WESTERN_ASIA, ...CENTRAL_ASIA, ...EAST_ASIA, ...SOUTH_ASIA, ...SOUTHEAST_ASIA, ...MIDDLE_EAST]);
const CONTINENT_GROUPS: [string, Set<string>][] = [
  ['Europe', EUROPE],
  ['South America', SOUTH_AMERICA],
  ['North America', NORTH_AMERICA],
  ['Oceania', OCEANIA],
  ['Africa', AFRICA],
  ['Asia', ASIA],
];
const AMERICAS = new Set(['North America', 'South America']);

function subregionEntries(countries: Set<string>, subregion: string): [string, string][] {
  return [...countries].map((country) => [country, subregion] as [string, string]);
}

const EUROPE_SUBREGIONS = new Map<string, string>([
  ...subregionEntries(WESTERN_NORTHERN_EUROPE, 'Western and Northern Europe'),
  ...subregionEntries(SOUTHERN_EASTERN_EUROPE, 'Southern and Eastern Europe'),
]);
const ASIA_SUBREGIONS = new Map<string, string>([
  ...subregionEntries(MIDDLE_EAST, 'Middle East'),
  ...subregionEntries(EAST_ASIA, 'East Asia'),
  ...subregionEntries(SOUTH_ASIA, 'South Asia'),
  ...subregionEntries(SOUTHEAST_ASIA, 'Southeast Asia'),
  ...subregionEntries(CENTRAL_ASIA, 'Central Asia'),
  ...subregionEntries(WESTERN_ASIA, 'Western Asia'),
]);
const NORTH_AMERICA_SUBREGIONS = new Map<string, string>([
  ...subregionEntries(CENTRAL_AMERICA, 'Central America'),
  ...subregionEntries(CARIBBEAN, 'Caribbean'),
  ['GL', 'Greenland'],
  ...subregionEntries(NORTHERN_AMERICA, 'Northern America'),
]);
const SOUTH_AMERICA_SUBREGIONS = new Map<string, string>(subregionEntries(SOUTH_AMERICA, 'South America'));
const OCEANIA_SUBREGIONS = new Map<string, string>([
  ['AU', 'Australia'], ['NZ', 'New Zealand'],
  ...subregionEntries(PACIFIC_ISLANDS, 'Pacific Islands'),
]);
const ANTARCTICA_SUBREGIONS = new Map<string, string>([['AQ', 'Antarctica']]);
const SUBREGIONS_BY_CONTINENT: Record<string, ReadonlyMap<string, string>> = {
  Europe: EUROPE_SUBREGIONS,
  Asia: ASIA_SUBREGIONS,
  'North America': NORTH_AMERICA_SUBREGIONS,
  'South America': SOUTH_AMERICA_SUBREGIONS,
  Oceania: OCEANIA_SUBREGIONS,
  Antarctica: ANTARCTICA_SUBREGIONS,
};

export type RouteRegion = {
  continent: string;
  subregion: string;
  westernNorthernEurope: boolean;
  australiaNewZealand: boolean;
  pacificIsland: boolean;
  africa: boolean;
  middleEast: boolean;
  southAmerica: boolean;
  americas: boolean;
  arctic: boolean;
};

function continentFor(place: Candidate): string {
  if (place.country === 'AQ') return 'Antarctica';
  if (isAsianRussia(place)) return 'Asia';
  const continent = CONTINENT_GROUPS.find(([, countries]) => countries.has(place.country))?.[0];
  if (!continent) throw new Error(`No explicit continent mapping for ${place.name} (${place.country})`);
  return continent;
}

function isAsianRussia(place: Candidate): boolean {
  return place.country === 'RU' && place.lng >= 60;
}

function africaSubregion(place: Candidate): string {
  if (place.lat >= 20) return 'Northern Africa';
  if (place.lng < -15) return 'Western Africa';
  if (place.lng > 30) return 'Eastern Africa';
  return 'Central and Southern Africa';
}

type SubregionOptions = { place: Candidate; continent: string };

function subregionFor(options: SubregionOptions): string {
  const { place, continent } = options;
  if (continent === 'Africa') return africaSubregion(place);
  if (continent === 'North America' && isHawaii(place)) return 'Pacific Islands';
  const subregion = SUBREGIONS_BY_CONTINENT[continent]?.get(place.country);
  if (!subregion) throw new Error(`No explicit subregion mapping for ${place.name} (${place.country}, ${continent})`);
  return subregion;
}

function isHawaii(place: Candidate): boolean {
  return place.country === 'US' && place.lat >= 18 && place.lat <= 23 && place.lng <= -150;
}

function isArcticPlace(code: string, latitude: number): boolean {
  return code === 'GL' || (code === 'CA' && latitude >= 65);
}

export function classifyRegion(place: Candidate): RouteRegion {
  const code = place.country;
  const continent = continentFor(place);
  const subregion = subregionFor({ place, continent });
  const hawaii = isHawaii(place);
  const pacificIsland = PACIFIC_ISLANDS.has(code) || hawaii;
  return {
    continent,
    subregion,
    westernNorthernEurope: WESTERN_NORTHERN_EUROPE.has(code),
    australiaNewZealand: code === 'AU' || code === 'NZ',
    pacificIsland,
    africa: continent === 'Africa',
    middleEast: MIDDLE_EAST.has(code),
    southAmerica: continent === 'South America',
    americas: AMERICAS.has(continent),
    arctic: isArcticPlace(code, place.lat),
  };
}

export function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60).toString().padStart(2, '0');
  const minutes = (absolute % 60).toString().padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}
