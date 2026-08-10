import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
export type MonitorReferenceLayerId = 'spc-mesoscale-discussion';

export type MonitorReferenceLayerStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'stale' | 'error';

/** Short, bounded retry schedule for transient NOAA upstream failures. */
export const MONITOR_REFERENCE_RETRY_DELAYS_MS = [1000, 5000] as const;

export class MonitorReferenceError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'MonitorReferenceError';
  }
}

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
  validityText?: string;
  affected?: string;
  concerning?: string;
  summary?: string;
  discussion?: string;
  sourceUrl?: string;
}

/** Presents an ISO instant or WMS interval in a compact, local-time label. */
export const formatMonitorReferenceTime = (value: string | null): string => {
  if (!value) return 'provider latest';
  const [start, end] = value.split('/');
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  if (!Number.isNaN(startDate.getTime())) {
    const format = (date: Date) => date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    return endDate && !Number.isNaN(endDate.getTime())
      ? `${format(startDate)}–${format(endDate)}`
      : format(startDate);
  }
  return value;
};

export type MonitorMesoscaleDiscussionCollection = FeatureCollection<
  Polygon | MultiPolygon,
  MonitorMesoscaleDiscussionProperties
>;

export const SPC_MESOSCALE_DISCUSSION_SOURCE: MonitorReferenceSourceInfo = {
  id: 'spc-mesoscale-discussion',
  label: 'SPC mesoscale discussions',
  sourceName: 'NOAA/NWS Storm Prediction Center',
  sourceUrl: 'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/spc_mesoscale_discussion/MapServer/0',
  attribution: 'NOAA/NWS/SPC',
};

const SPC_QUERY_URL = `${SPC_MESOSCALE_DISCUSSION_SOURCE.sourceUrl}/query`;

const sleep = (delayMs: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, delayMs);
});

/** Retries a reference request twice, with enough delay to avoid hammering a recovering provider. */
export const withReferenceRetry = async <T>(
  operation: () => Promise<T>,
  retryDelaysMs: readonly number[] = MONITOR_REFERENCE_RETRY_DELAYS_MS,
  wait: (delayMs: number) => Promise<void> = sleep,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      if (error instanceof MonitorReferenceError && !error.retryable) {
        break;
      }
      const delayMs = retryDelaysMs[attempt];
      if (delayMs === undefined) {
        break;
      }
      await wait(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Reference source unavailable.');
};

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
  | 'validityText'
  | 'affected'
  | 'concerning'
  | 'summary'
  | 'discussion'
  | 'sourceUrl';

const NORMALIZED_PROPERTY_ALIASES = [
  ['issuedAt', ['issuedAt', 'issued', 'issue_time', 'issuetime']],
  ['validFrom', ['validFrom', 'valid', 'valid_start', 'validstart']],
  ['validTo', ['validTo', 'expire', 'expires', 'valid_end', 'validend']],
  ['validityText', ['validityText']],
  ['affected', ['affected', 'areas_affected', 'affected_area']],
  ['concerning', ['concerning', 'concerning_line']],
  ['summary', ['summary', 'summary_text']],
  ['discussion', ['discussion', 'technical_discussion', 'discussion_text']],
  ['sourceUrl', ['sourceUrl', 'url', 'link', 'product_url']],
] as const satisfies ReadonlyArray<readonly [NormalizedPropertyKey, readonly string[]]>;

type NormalizedProperties = Partial<Record<NormalizedPropertyKey, string>>;

const withPresentNormalizedProperty = (
  properties: NormalizedProperties,
  property: NormalizedPropertyKey,
  value: string | undefined,
): NormalizedProperties => (value ? { ...properties, [property]: value } : properties);

const readAliasProperties = (record: Record<string, unknown>): NormalizedProperties =>
  NORMALIZED_PROPERTY_ALIASES.reduce<NormalizedProperties>(
    (properties, [property, aliases]) => withPresentNormalizedProperty(properties, property, readString(record, aliases)),
    {},
  );

const readNormalizedProperties = (record: Record<string, unknown>): NormalizedProperties => {
  const aliasedProperties = readAliasProperties(record);
  const withIssuedAt = withPresentNormalizedProperty(
    aliasedProperties,
    'issuedAt',
    readInstant(record, ['issuedAt', 'issued', 'issue_time', 'issuetime', 'idp_filedate']),
  );
  const withProviderValidityText = withPresentNormalizedProperty(
    withIssuedAt,
    'validityText',
    readString(record, ['validityText', 'folderpath']),
  );
  return withPresentNormalizedProperty(
    withProviderValidityText,
    'sourceUrl',
    withProviderValidityText.sourceUrl ?? readString(record, ['popupinfo']),
  );
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
    throw new MonitorReferenceError(
      `SPC mesoscale discussions unavailable (${response.status}).`,
      response.status >= 500,
    );
  }
  const payload = await response.json();
  const normalized = normalizeSpcMesoscaleDiscussionCollection(payload);
  if (isRecord(payload) && Array.isArray(payload.features) && payload.features.length > 0 && normalized.features.length === 0) {
    throw new MonitorReferenceError(
      'SPC mesoscale discussion response contained no usable polygon features.',
      false,
    );
  }
  return normalized;
};
