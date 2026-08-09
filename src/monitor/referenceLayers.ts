import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { WmsLayerConfig } from './wms';

export type MonitorReferenceLayerId = 'ndfd-temperature' | 'spc-mesoscale-discussion';

export type MonitorReferenceLayerStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'stale' | 'error';

export interface MonitorReferenceLayerMeta {
  status: MonitorReferenceLayerStatus;
  sourceName: string;
  sourceUrl: string;
  attribution: string;
  fetchedAt: string | null;
  validTime: string | null;
  itemCount: number;
  error: string | null;
}

export interface MonitorReferenceSourceInfo {
  id: MonitorReferenceLayerId;
  label: string;
  sourceName: string;
  sourceUrl: string;
  attribution: string;
}

export interface MonitorMesoscaleDiscussionProperties {
  [key: string]: unknown;
  label: string;
  productNumber?: string;
  issuedAt?: string;
  validFrom?: string;
  validTo?: string;
  affected?: string;
  concerning?: string;
  summary?: string;
  discussion?: string;
  sourceUrl?: string;
}

export type MonitorMesoscaleDiscussionCollection = FeatureCollection<
  Polygon | MultiPolygon,
  MonitorMesoscaleDiscussionProperties
>;

export const NDFD_TEMPERATURE_SOURCE: MonitorReferenceSourceInfo = {
  id: 'ndfd-temperature',
  label: 'NDFD temperature forecast',
  sourceName: 'NOAA/NWS National Digital Forecast Database',
  sourceUrl: 'https://mapservices.weather.noaa.gov/raster/rest/services/NDFD/NDFD_temp/MapServer',
  attribution: 'NOAA/NWS NDFD',
};

export const SPC_MESOSCALE_DISCUSSION_SOURCE: MonitorReferenceSourceInfo = {
  id: 'spc-mesoscale-discussion',
  label: 'SPC mesoscale discussions',
  sourceName: 'NOAA/NWS Storm Prediction Center',
  sourceUrl: 'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/spc_mesoscale_discussion/MapServer/0',
  attribution: 'NOAA/NWS/SPC',
};

const NDFD_WMS_URL = 'https://mapservices.weather.noaa.gov/raster/services/NDFD/NDFD_temp/MapServer/WMSServer';
const SPC_QUERY_URL = `${SPC_MESOSCALE_DISCUSSION_SOURCE.sourceUrl}/query`;

/** Builds the current NDFD WMS layer; the service chooses the latest image when time is absent. */
export const buildNdfdTemperatureLayerConfig = (latestTime?: string): WmsLayerConfig => ({
  url: NDFD_WMS_URL,
  layer: '2',
  ...(latestTime ? { latestTime } : {}),
});

/** Builds the bounded ArcGIS GeoJSON query used for current SPC MD polygons. */
export const buildSpcMesoscaleDiscussionQueryUrl = (): string => {
  const query = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    returnGeometry: 'true',
    f: 'geojson',
  });
  return `${SPC_QUERY_URL}?${query.toString()}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readField = (record: Record<string, unknown>, names: readonly string[]): unknown => {
  const key = Object.keys(record).find((candidate) => names.some((name) => candidate.toLowerCase() === name.toLowerCase()));
  return key ? record[key] : undefined;
};

const readString = (record: Record<string, unknown>, names: readonly string[]): string | undefined => {
  const value = readField(record, names);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const readProductNumber = (record: Record<string, unknown>): string | undefined => {
  const value = readField(record, ['productNumber', 'product_number', 'mdnum', 'md_num', 'number']);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).padStart(4, '0');
  if (typeof value === 'string' && value.trim()) return value.trim();

  const providerName = readString(record, ['name', 'title']);
  const match = providerName?.match(/(?:\b(?:MCD|MD)\s*|\bMesoscale Discussion\s+)(\d{1,4})\b/i);
  return match ? match[1].padStart(4, '0') : undefined;
};

const readInstant = (record: Record<string, unknown>, names: readonly string[]): string | undefined => {
  const value = readField(record, names);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
  }
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const isPolygonGeometry = (value: unknown): value is Polygon | MultiPolygon =>
  isRecord(value) && (value.type === 'Polygon' || value.type === 'MultiPolygon') && Array.isArray(value.coordinates);

type NormalizedPropertyKey =
  | 'issuedAt'
  | 'validFrom'
  | 'validTo'
  | 'affected'
  | 'concerning'
  | 'summary'
  | 'discussion'
  | 'sourceUrl';

const NORMALIZED_PROPERTY_ALIASES = [
  ['issuedAt', ['issuedAt', 'issued', 'issue_time', 'issuetime']],
  ['validFrom', ['validFrom', 'valid', 'valid_start', 'validstart']],
  ['validTo', ['validTo', 'expire', 'expires', 'valid_end', 'validend']],
  ['affected', ['affected', 'areas_affected', 'affected_area']],
  ['concerning', ['concerning', 'concerning_line']],
  ['summary', ['summary', 'summary_text']],
  ['discussion', ['discussion', 'technical_discussion', 'discussion_text']],
  ['sourceUrl', ['sourceUrl', 'url', 'link', 'product_url']],
] as const satisfies ReadonlyArray<readonly [NormalizedPropertyKey, readonly string[]]>;

const readNormalizedProperties = (record: Record<string, unknown>): Partial<Record<NormalizedPropertyKey, string>> => {
  const properties: Partial<Record<NormalizedPropertyKey, string>> = {};
  const issuedAt = readInstant(record, ['issuedAt', 'issued', 'issue_time', 'issuetime', 'idp_filedate']);
  if (issuedAt) properties.issuedAt = issuedAt;

  for (const [property, aliases] of NORMALIZED_PROPERTY_ALIASES) {
    if (property === 'issuedAt') continue;
    const value = readString(record, aliases);
    if (value) properties[property] = value;
  }

  const providerValidity = readString(record, ['folderpath']);
  if (!properties.validTo && providerValidity) properties.validTo = providerValidity;
  if (!properties.sourceUrl) {
    const sourceUrl = readString(record, ['popupinfo']);
    if (sourceUrl) properties.sourceUrl = sourceUrl;
  }
  return properties;
};

const normalizeProperties = (value: unknown): MonitorMesoscaleDiscussionProperties => {
  const record = isRecord(value) ? value : {};
  const productNumber = readProductNumber(record);
  const label = readString(record, ['label', 'title'])
    ?? (productNumber ? `Mesoscale Discussion ${productNumber}` : readString(record, ['name']) ?? 'Mesoscale discussion');

  return {
    label,
    ...(productNumber ? { productNumber } : {}),
    ...readNormalizedProperties(record),
  };
};

const normalizeSpcMesoscaleDiscussionFeature = (candidate: unknown, index: number) => {
  if (!isRecord(candidate) || !isPolygonGeometry(candidate.geometry)) return null;

  const candidateId = candidate.id;
  const id = typeof candidateId === 'string' || typeof candidateId === 'number'
    ? String(candidateId)
    : `spc-md-${index}`;
  return {
    type: 'Feature' as const,
    id,
    geometry: candidate.geometry,
    properties: normalizeProperties(candidate.properties),
  };
};

const isSpcMesoscaleDiscussionCollection = (
  value: unknown,
): value is { type: 'FeatureCollection'; features: unknown[] } => {
  if (!isRecord(value)) return false;
  if (value.type !== 'FeatureCollection') return false;
  return Array.isArray(value.features);
};

/** Normalizes the provider GeoJSON shape while dropping malformed non-polygon features. */
export const normalizeSpcMesoscaleDiscussionCollection = (value: unknown): MonitorMesoscaleDiscussionCollection => {
  if (!isSpcMesoscaleDiscussionCollection(value)) {
    throw new Error('SPC mesoscale discussion response is not a GeoJSON FeatureCollection.');
  }

  const features = value.features
    .map((candidate, index) => normalizeSpcMesoscaleDiscussionFeature(candidate, index))
    .filter((feature): feature is NonNullable<typeof feature> => feature !== null);

  return { type: 'FeatureCollection', features };
};

/** Fetches and normalizes the current SPC MD GeoJSON snapshot. */
export const fetchSpcMesoscaleDiscussions = async (
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<MonitorMesoscaleDiscussionCollection> => {
  const response = await fetcher(buildSpcMesoscaleDiscussionQueryUrl(), {
    headers: { Accept: 'application/geo+json' },
  });
  if (!response.ok) {
    throw new Error(`SPC mesoscale discussions unavailable (${response.status}).`);
  }
  return normalizeSpcMesoscaleDiscussionCollection(await response.json());
};
