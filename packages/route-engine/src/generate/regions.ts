import type { Candidate } from './types';

const WESTERN_NORTHERN_EUROPE = new Set([
  'AT', 'BE', 'CH', 'DE', 'DK', 'ES', 'FI', 'FR', 'GB', 'IE', 'IS', 'IT', 'LU', 'NL', 'NO', 'PT', 'SE',
]);
const MIDDLE_EAST = new Set(['AE', 'BH', 'IR', 'IQ', 'IL', 'JO', 'KW', 'LB', 'OM', 'PS', 'QA', 'SA', 'SY', 'TR', 'YE']);
const AFRICA = new Set([
  'AO', 'BF', 'BI', 'BJ', 'BW', 'CD', 'CF', 'CG', 'CI', 'CM', 'CV', 'DJ', 'DZ', 'EG', 'EH', 'ER', 'ET', 'GA', 'GH', 'GM', 'GN', 'GQ', 'GW', 'KE', 'KM', 'LR', 'LS', 'LY', 'MA', 'MG', 'ML', 'MR', 'MU', 'MW', 'MZ', 'NA', 'NE', 'NG', 'RW', 'SC', 'SD', 'SL', 'SN', 'SO', 'SS', 'ST', 'SZ', 'TD', 'TG', 'TN', 'TZ', 'UG', 'ZA', 'ZM', 'ZW',
]);
const SOUTH_AMERICA = new Set(['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PE', 'PY', 'SR', 'UY', 'VE']);
const NORTH_AMERICA = new Set([
  'AG', 'AI', 'AW', 'BB', 'BL', 'BM', 'BQ', 'BS', 'BZ', 'CA', 'CR', 'CU', 'CW', 'DM', 'DO', 'GD', 'GL', 'GP', 'GT', 'HN', 'HT', 'JM', 'KN', 'KY', 'LC', 'MF', 'MQ', 'MS', 'MX', 'NI', 'PA', 'PM', 'PR', 'SV', 'SX', 'TC', 'TT', 'US', 'VC', 'VG', 'VI',
]);
const OCEANIA = new Set(['AS', 'AU', 'CK', 'FJ', 'FM', 'GU', 'KI', 'MH', 'MP', 'NC', 'NU', 'NZ', 'PF', 'PG', 'PW', 'SB', 'TK', 'TO', 'TV', 'VU', 'WF']);
const PACIFIC_ISLANDS = new Set(['AS', 'CK', 'FJ', 'FM', 'GU', 'KI', 'MH', 'MP', 'NC', 'NU', 'PF', 'PG', 'PW', 'SB', 'TK', 'TO', 'TV', 'VU', 'WF']);
const WESTERN_ASIA = new Set(['AM', 'AZ', 'GE', 'KZ', 'KG', 'TJ', 'TM', 'UZ']);
const EAST_ASIA = new Set(['CN', 'HK', 'JP', 'KP', 'KR', 'MO', 'MN', 'TW']);
const SOUTH_ASIA = new Set(['AF', 'BD', 'BT', 'IN', 'MV', 'NP', 'PK', 'LK']);
const SOUTHEAST_ASIA = new Set(['BN', 'ID', 'KH', 'LA', 'MM', 'MY', 'PH', 'SG', 'TH', 'TL', 'VN']);
const CENTRAL_AMERICA = new Set(['BZ', 'CR', 'GT', 'HN', 'NI', 'PA', 'SV']);
const CARIBBEAN = new Set(['AG', 'AI', 'AW', 'BB', 'BL', 'BM', 'BQ', 'BS', 'CU', 'CW', 'DM', 'DO', 'GD', 'GP', 'HT', 'JM', 'KN', 'KY', 'LC', 'MF', 'MQ', 'MS', 'PR', 'SX', 'TC', 'TT', 'VC', 'VG', 'VI']);
const CONTINENT_GROUPS: [string, Set<string>][] = [
  ['South America', SOUTH_AMERICA],
  ['North America', NORTH_AMERICA],
  ['Oceania', OCEANIA],
  ['Africa', AFRICA],
  ['Asia', new Set([...WESTERN_ASIA, ...EAST_ASIA, ...SOUTH_ASIA, ...SOUTHEAST_ASIA, ...MIDDLE_EAST])],
];
const AMERICAS = new Set(['North America', 'South America']);

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
  return CONTINENT_GROUPS.find(([, countries]) => countries.has(place.country))?.[0] ?? 'Europe';
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

function asiaSubregion(place: Candidate): string {
  const code = place.country;
  if (MIDDLE_EAST.has(code)) return 'Middle East';
  if (EAST_ASIA.has(code)) return 'East Asia';
  if (SOUTH_ASIA.has(code)) return 'South Asia';
  if (SOUTHEAST_ASIA.has(code)) return 'Southeast Asia';
  return 'Central Asia';
}

function northAmericaSubregion(place: Candidate): string {
  const code = place.country;
  if (CENTRAL_AMERICA.has(code)) return 'Central America';
  if (CARIBBEAN.has(code)) return 'Caribbean';
  if (code === 'GL') return 'Greenland';
  return 'Northern America';
}

type SubregionOptions = { place: Candidate; continent: string };

function subregionFor(options: SubregionOptions): string {
  const { place, continent } = options;
  switch (continent) {
    case 'Europe': return europeSubregion(place);
    case 'Africa': return africaSubregion(place);
    case 'Asia': return asiaSubregion(place);
    case 'North America': return northAmericaSubregion(place);
    case 'South America': return 'South America';
    case 'Oceania': return oceaniaSubregion(place);
    default: return continent;
  }
}

function europeSubregion(place: Candidate): string {
  return WESTERN_NORTHERN_EUROPE.has(place.country) ? 'Western and Northern Europe' : 'Southern and Eastern Europe';
}

function oceaniaSubregion(place: Candidate): string {
  const code = place.country;
  if (code === 'AU') return 'Australia';
  if (code === 'NZ') return 'New Zealand';
  return 'Pacific Islands';
}

function isArcticPlace(code: string, latitude: number): boolean {
  return code === 'GL' || (code === 'CA' && latitude >= 65);
}

export function classifyRegion(place: Candidate): RouteRegion {
  const code = place.country;
  const continent = continentFor(place);
  const subregion = subregionFor({ place, continent });
  const hawaii = code === 'US' && place.lat >= 18 && place.lat <= 23 && place.lng <= -150;
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
