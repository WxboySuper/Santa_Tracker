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

export function classifyRegion(place: Candidate): RouteRegion {
  const code = place.country;
  let continent = 'Europe';
  if (code === 'AQ') continent = 'Antarctica';
  else if (SOUTH_AMERICA.has(code)) continent = 'South America';
  else if (NORTH_AMERICA.has(code)) continent = 'North America';
  else if (OCEANIA.has(code)) continent = 'Oceania';
  else if (AFRICA.has(code)) continent = 'Africa';
  else if (WESTERN_ASIA.has(code) || EAST_ASIA.has(code) || SOUTH_ASIA.has(code) || SOUTHEAST_ASIA.has(code) || MIDDLE_EAST.has(code) || code === 'RU' && place.lng >= 60) continent = 'Asia';

  let subregion = continent;
  if (continent === 'Europe') {
    subregion = WESTERN_NORTHERN_EUROPE.has(code) ? 'Western and Northern Europe' : 'Southern and Eastern Europe';
  } else if (continent === 'Africa') {
    subregion = place.lat >= 20 ? 'Northern Africa' : place.lng < -15 ? 'Western Africa' : place.lng > 30 ? 'Eastern Africa' : 'Central and Southern Africa';
  } else if (continent === 'Asia') {
    subregion = MIDDLE_EAST.has(code) ? 'Middle East' : EAST_ASIA.has(code) ? 'East Asia' : SOUTH_ASIA.has(code) ? 'South Asia' : SOUTHEAST_ASIA.has(code) ? 'Southeast Asia' : 'Central Asia';
  } else if (continent === 'North America') {
    subregion = CENTRAL_AMERICA.has(code) ? 'Central America' : CARIBBEAN.has(code) ? 'Caribbean' : code === 'GL' ? 'Greenland' : 'Northern America';
  } else if (continent === 'South America') {
    subregion = 'South America';
  } else if (continent === 'Oceania') {
    subregion = code === 'AU' ? 'Australia' : code === 'NZ' ? 'New Zealand' : 'Pacific Islands';
  }

  const hawaii = code === 'US' && place.lat >= 18 && place.lat <= 23 && place.lng <= -150;
  const pacificIsland = PACIFIC_ISLANDS.has(code) || hawaii;
  const arctic = code === 'GL' || code === 'CA' && place.lat >= 65;
  return {
    continent,
    subregion,
    westernNorthernEurope: WESTERN_NORTHERN_EUROPE.has(code),
    australiaNewZealand: code === 'AU' || code === 'NZ',
    pacificIsland,
    africa: continent === 'Africa',
    middleEast: MIDDLE_EAST.has(code),
    southAmerica: continent === 'South America',
    americas: continent === 'North America' || continent === 'South America',
    arctic,
  };
}

export function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60).toString().padStart(2, '0');
  const minutes = (absolute % 60).toString().padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}
