/** SPC-style CONUS envelope used for lake filtering and optional domain clipping. */
export const CONUS_BBOX: [number, number, number, number] = [-125, 24, -66, 50];

/** Great Lakes names present in Natural Earth 110m lakes (prototype subset). */
export const GREAT_LAKE_NAMES = [
  'Lake Superior',
  'Lake Michigan',
  'Lake Huron',
  'Lake Erie',
  'Lake Ontario',
] as const;
