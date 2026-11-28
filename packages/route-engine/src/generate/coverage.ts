/** ISO alpha-2 country codes for non-sovereign territories and ISO-listed areas.
 * These are optional; sovereign states remain mandatory even when they are small islands.
 * Keep this explicit so changes to route coverage can be reviewed with the owner.
 */
export const NON_SOVEREIGN_TERRITORY_CODES = new Set([
  'AI', 'AS', 'AQ', 'AW', 'AX', 'BL', 'BM', 'BQ', 'BV', 'CC', 'CK', 'CW', 'CX', 'EH',
  'FK', 'FO', 'GF', 'GG', 'GI', 'GL', 'GP', 'GS', 'GU', 'HK', 'HM', 'IM', 'IO', 'JE',
  'KY', 'MF', 'MO', 'MP', 'MQ', 'MS', 'NC', 'NF', 'NU', 'PF', 'PM', 'PN', 'PR', 'RE',
  'SH', 'SJ', 'SX', 'TC', 'TF', 'TK', 'TW', 'UM', 'VG', 'VI', 'WF', 'XK', 'YT',
]);

/** Remote or sparsely populated territories may be visited only when no new leg exceeds 3,000 km. */
export const REMOTE_OPTIONAL_TERRITORY_CODES = new Set([
  'AI', 'AQ', 'AS', 'AX', 'BV', 'CC', 'CK', 'CX', 'FK', 'FO', 'GS', 'HM', 'IO', 'NF',
  'NU', 'PN', 'PM', 'SH', 'SJ', 'TF', 'TK', 'UM', 'WF', 'YT',
]);

export function isSovereignState(code: string): boolean {
  return !NON_SOVEREIGN_TERRITORY_CODES.has(code);
}

export function isRemoteOptionalTerritory(code: string): boolean {
  return REMOTE_OPTIONAL_TERRITORY_CODES.has(code);
}
