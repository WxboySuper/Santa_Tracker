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
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value).padStart(4, '0')
    : typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const isPolygonGeometry = (value: unknown): value is Polygon | MultiPolygon =>
  isRecord(value) && (value.type === 'Polygon' || value.type === 'MultiPolygon') && Array.isArray(value.coordinates);

const normalizeProperties = (value: unknown): MonitorMesoscaleDiscussionProperties => {
  const record = isRecord(value) ? value : {};
  const productNumber = readProductNumber(record);
  const label = readString(record, ['label', 'name', 'title'])
    ?? (productNumber ? `Mesoscale Discussion ${productNumber}` : 'Mesoscale discussion');

  return {
    label,
    ...(productNumber ? { productNumber } : {}),
    ...(readString(record, ['issuedAt', 'issued', 'issue_time', 'issuetime']) ? { issuedAt: readString(record, ['issuedAt', 'issued', 'issue_time', 'issuetime']) } : {}),
    ...(readString(record, ['validFrom', 'valid', 'valid_start', 'validstart']) ? { validFrom: readString(record, ['validFrom', 'valid', 'valid_start', 'validstart']) } : {}),
    ...(readString(record, ['validTo', 'expire', 'expires', 'valid_end', 'validend']) ? { validTo: readString(record, ['validTo', 'expire', 'expires', 'valid_end', 'validend']) } : {}),
    ...(readString(record, ['affected', 'areas_affected', 'affected_area']) ? { affected: readString(record, ['affected', 'areas_affected', 'affected_area']) } : {}),
    ...(readString(record, ['concerning', 'concerning_line']) ? { concerning: readString(record, ['concerning', 'concerning_line']) } : {}),
    ...(readString(record, ['summary', 'summary_text']) ? { summary: readString(record, ['summary', 'summary_text']) } : {}),
    ...(readString(record, ['discussion', 'technical_discussion', 'discussion_text']) ? { discussion: readString(record, ['discussion', 'technical_discussion', 'discussion_text']) } : {}),
    ...(readString(record, ['sourceUrl', 'url', 'link', 'product_url']) ? { sourceUrl: readString(record, ['sourceUrl', 'url', 'link', 'product_url']) } : {}),
  };
};

/** Normalizes the provider GeoJSON shape while dropping malformed non-polygon features. */
export const normalizeSpcMesoscaleDiscussionCollection = (value: unknown): MonitorMesoscaleDiscussionCollection => {
  if (!isRecord(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) {
    throw new Error('SPC mesoscale discussion response is not a GeoJSON FeatureCollection.');
  }

  const features = value.features.flatMap((candidate, index) => {
    if (!isRecord(candidate) || !isPolygonGeometry(candidate.geometry)) {
      return [];
    }

    const id = typeof candidate.id === 'string' || typeof candidate.id === 'number'
      ? String(candidate.id)
      : `spc-md-${index}`;
    return [{
      type: 'Feature' as const,
      id,
      geometry: candidate.geometry,
      properties: normalizeProperties(candidate.properties),
    }];
  });

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
