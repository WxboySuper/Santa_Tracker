import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeoJsonProperties,
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon,
} from 'geojson';
import type {
  DatAttachment,
  DatBoundingBox,
  DatDamagePoint,
  DatDamagePolygon,
  DatDateRange,
  DatEvidence,
  DatQueryOptions,
  DatTrack,
} from './types';

export const DAT_SERVICE_URL =
  'https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer';
export const DAT_LAYER_IDS = {
  damagePoints: 0,
  tracks: 1,
  damagePolygons: 2,
} as const;
export const DAT_MAX_RECORD_COUNT = 2000;

type DatRawProperties = Record<string, unknown>;
type DatRawFeature = Feature<Geometry, GeoJsonProperties> & { id?: string | number };
type DatRawFeatureCollection = FeatureCollection<Geometry, GeoJsonProperties> & {
  exceededTransferLimit?: boolean;
  error?: DatArcGisError;
};

interface DatArcGisError {
  code?: number;
  message?: string;
  details?: string[];
}

export class DatClientError extends Error {
  readonly status?: number;
  readonly code?: number;

  constructor(message: string, options: { status?: number; code?: number } = {}) {
    super(message);
    this.name = 'DatClientError';
    this.status = options.status;
    this.code = options.code;
  }
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const asNumber = (value: unknown): number | null => {
  if (isFiniteNumber(value)) {
    return value === -99 ? null : value;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== -99 ? parsed : null;
};

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const asDate = (value: unknown): string | null => {
  if (isFiniteNumber(value)) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString();
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
};

const propertiesOf = (feature: DatRawFeature): DatRawProperties =>
  (feature.properties ?? {}) as DatRawProperties;

const objectIdOf = (feature: DatRawFeature): number | null =>
  asNumber(propertiesOf(feature).objectid) ?? asNumber(feature.id);

const pointGeometry = (feature: DatRawFeature): Point | null =>
  feature.geometry?.type === 'Point' ? feature.geometry : null;

const lineGeometry = (feature: DatRawFeature): LineString | MultiLineString | null =>
  feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString'
    ? feature.geometry
    : null;

const polygonGeometry = (feature: DatRawFeature): Polygon | MultiPolygon | null =>
  feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon'
    ? feature.geometry
    : null;

const normalizeTrack = (feature: DatRawFeature): DatTrack | null => {
  const properties = propertiesOf(feature);
  const geometry = lineGeometry(feature);
  const objectId = objectIdOf(feature);
  if (!geometry || objectId === null) {
    return null;
  }
  return {
    objectId,
    globalId: asString(properties.globalid),
    eventId: asString(properties.event_id),
    stormDate: asDate(properties.stormdate),
    startTime: asDate(properties.starttime),
    endTime: asDate(properties.endtime),
    startLat: asNumber(properties.startlat),
    startLon: asNumber(properties.startlon),
    endLat: asNumber(properties.endlat),
    endLon: asNumber(properties.endlon),
    length: asNumber(properties.length),
    width: asNumber(properties.width),
    injuries: asNumber(properties.injuries),
    fatalities: asNumber(properties.fatalities),
    efScale: asString(properties.efscale),
    efNumber: asNumber(properties.efnum),
    maxWind: asNumber(properties.maxwind),
    wfo: asString(properties.wfo),
    comments: asString(properties.comments),
    geometry,
  };
};

const normalizeDamagePoint = (feature: DatRawFeature): DatDamagePoint | null => {
  const properties = propertiesOf(feature);
  const geometry = pointGeometry(feature);
  const objectId = objectIdOf(feature);
  const latitude = asNumber(properties.lat) ?? geometry?.coordinates[1] ?? null;
  const longitude = asNumber(properties.lon) ?? geometry?.coordinates[0] ?? null;
  if (!geometry) {
    return null;
  }
  if (objectId === null) {
    return null;
  }
  if (latitude === null) {
    return null;
  }
  if (longitude === null) {
    return null;
  }
  return {
    objectId,
    globalId: asString(properties.globalid),
    pathGuid: asString(properties.path_guid),
    eventId: asString(properties.event_id),
    stormDate: asDate(properties.stormdate),
    surveyDate: asDate(properties.surveydate),
    damage: asNumber(properties.damage) ?? asString(properties.damage),
    damageText: asString(properties.damage_txt),
    degreeOfDamage: asNumber(properties.dod) ?? asString(properties.dod),
    degreeOfDamageText: asString(properties.dod_txt),
    efScale: asString(properties.efscale),
    windSpeed: asNumber(properties.windspeed),
    damageDirection: asString(properties.damage_dir),
    injuries: asNumber(properties.injuries),
    deaths: asNumber(properties.deaths),
    office: asString(properties.office),
    surveyType: asString(properties.surveytype),
    comments: asString(properties.comments),
    image: asString(properties.image),
    latitude,
    longitude,
    geometry,
  };
};

const normalizeDamagePolygon = (feature: DatRawFeature): DatDamagePolygon | null => {
  const properties = propertiesOf(feature);
  const geometry = polygonGeometry(feature);
  const objectId = objectIdOf(feature);
  if (!geometry || objectId === null) {
    return null;
  }
  return {
    objectId,
    globalId: asString(properties.globalid),
    pathGuid: asString(properties.path_guid),
    eventId: asString(properties.event_id),
    stormDate: asDate(properties.stormdate),
    efScale: asString(properties.efscale),
    length: asNumber(properties.length),
    width: asNumber(properties.width),
    injuries: asNumber(properties.injuries),
    fatalities: asNumber(properties.fatalities),
    comments: asString(properties.comments),
    geometry,
  };
};

const epochMillis = (value: string | number | Date): number => {
  const parsed = value instanceof Date ? value.valueOf() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new DatClientError(`Invalid DAT date value: ${String(value)}`);
  }
  return parsed;
};

const sqlLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const validBounds = (bounds: DatBoundingBox): boolean =>
  [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat].every(Number.isFinite) &&
  bounds.minLon <= bounds.maxLon && bounds.minLat <= bounds.maxLat;

/** Builds a deterministic ArcGIS query parameter set for one page. */
export const buildDatQueryParams = (
  options: DatQueryOptions = {},
  page: { offset?: number; pageSize?: number } = {},
): URLSearchParams => {
  const params = new URLSearchParams();
  params.set('where', options.where?.trim() || '1=1');
  params.set('outFields', options.outFields?.length ? options.outFields.join(',') : '*');
  params.set('returnGeometry', 'true');
  params.set('outSR', '4326');
  params.set('f', 'geojson');

  if (options.timeRange) {
    params.set('time', `${epochMillis(options.timeRange.start)},${epochMillis(options.timeRange.end)}`);
  }
  if (options.bounds) {
    if (!validBounds(options.bounds)) {
      throw new DatClientError('Invalid DAT bounding box.');
    }
    const { minLon, minLat, maxLon, maxLat } = options.bounds;
    params.set('geometry', `${minLon},${minLat},${maxLon},${maxLat}`);
    params.set('geometryType', 'esriGeometryEnvelope');
    params.set('inSR', '4326');
    params.set('spatialRel', 'esriSpatialRelIntersects');
  }
  if (options.orderByFields) {
    params.set('orderByFields', options.orderByFields);
  }
  params.set('resultOffset', String(page.offset ?? 0));
  params.set('resultRecordCount', String(page.pageSize ?? options.pageSize ?? DAT_MAX_RECORD_COUNT));
  return params;
};

const toErrorMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) {
    return null;
  }
  const error = (payload as { error?: DatArcGisError }).error;
  if (!error) {
    return 'NOAA DAT returned an unknown ArcGIS error.';
  }
  const message = error.message || 'NOAA DAT returned an ArcGIS error.';
  const details = error.details?.join(' ') ?? '';
  return [message, details].filter(Boolean).join(' ');
};

export interface DatClientOptions {
  serviceUrl?: string;
  fetchImpl?: typeof fetch;
  pageSize?: number;
}

export class DatClient {
  private readonly serviceUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(options: DatClientOptions = {}) {
    this.serviceUrl = options.serviceUrl ?? DAT_SERVICE_URL;
    // Browser fetch is a method of Window in some engines and throws when
    // invoked after being detached from its receiver. Keep injected test
    // clients untouched, but bind the native implementation for production.
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.pageSize = options.pageSize ?? DAT_MAX_RECORD_COUNT;
  }

  private async requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    const existing = this.inFlight.get(url);
    if (existing) {
      return existing as Promise<T>;
    }
    const request = this.fetchImpl(url, { signal })
      .then(async (response) => {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new DatClientError(`NOAA DAT returned invalid JSON (HTTP ${response.status}).`, { status: response.status });
        }
        const arcGisError = toErrorMessage(payload);
        if (!response.ok || arcGisError) {
          throw new DatClientError(
            arcGisError ?? `NOAA DAT request failed (HTTP ${response.status}).`,
            { status: response.status, code: (payload as { error?: DatArcGisError })?.error?.code },
          );
        }
        return payload as T;
      })
      .finally(() => {
        this.inFlight.delete(url);
      });
    this.inFlight.set(url, request);
    return request;
  }

  private async queryRaw(layerId: number, options: DatQueryOptions = {}): Promise<DatRawFeature[]> {
    const features: DatRawFeature[] = [];
    const pageSize = Math.min(options.pageSize ?? this.pageSize, DAT_MAX_RECORD_COUNT);
    let offset = 0;

    for (;;) {
      const params = buildDatQueryParams(options, { offset, pageSize });
      const url = `${this.serviceUrl}/${layerId}/query?${params.toString()}`;
      const payload = await this.requestJson<DatRawFeatureCollection>(url, options.signal);
      if (!Array.isArray(payload.features)) {
        throw new DatClientError('NOAA DAT returned a feature response without a features array.');
      }
      features.push(...(payload.features as DatRawFeature[]));
      if (!payload.exceededTransferLimit || payload.features.length === 0) {
        return features;
      }
      offset += payload.features.length;
    }
  }

  async queryTracks(options: DatQueryOptions = {}): Promise<DatTrack[]> {
    return (await this.queryRaw(DAT_LAYER_IDS.tracks, options))
      .map(normalizeTrack)
      .filter((track): track is DatTrack => Boolean(track));
  }

  async queryDamagePoints(options: DatQueryOptions = {}): Promise<DatDamagePoint[]> {
    return (await this.queryRaw(DAT_LAYER_IDS.damagePoints, options))
      .map(normalizeDamagePoint)
      .filter((point): point is DatDamagePoint => Boolean(point));
  }

  async queryDamagePolygons(options: DatQueryOptions = {}): Promise<DatDamagePolygon[]> {
    return (await this.queryRaw(DAT_LAYER_IDS.damagePolygons, options))
      .map(normalizeDamagePolygon)
      .filter((polygon): polygon is DatDamagePolygon => Boolean(polygon));
  }

  async queryDamagePointsForTrack(track: Pick<DatTrack, 'globalId'>, options: DatQueryOptions = {}): Promise<DatDamagePoint[]> {
    if (!track.globalId) {
      return [];
    }
    return this.queryDamagePoints({ ...options, where: `path_guid = ${sqlLiteral(track.globalId)}` });
  }

  async queryDamagePolygonsForTrack(track: Pick<DatTrack, 'globalId'>, options: DatQueryOptions = {}): Promise<DatDamagePolygon[]> {
    if (!track.globalId) {
      return [];
    }
    return this.queryDamagePolygons({ ...options, where: `path_guid = ${sqlLiteral(track.globalId)}` });
  }

  /** Loads tracks for a date range and follows the explicit globalid/path_guid associations. */
  async queryEvidenceForDate(timeRange: DatDateRange, signal?: AbortSignal): Promise<DatEvidence> {
    // The DAT viewer's current-event view queries each layer by date. Some
    // newer records have null path_guid values, so a track-only relationship
    // walk misses valid survey observations. Keep the relationship walk for
    // older/associated records, then merge it with direct date results.
    const [tracks, datedDamagePoints, datedDamagePolygons] = await Promise.all([
      this.queryTracks({ timeRange, signal }),
      this.queryDamagePoints({ timeRange, signal }),
      this.queryDamagePolygons({ timeRange, signal }),
    ]);
    const damagePointsById = new Map(datedDamagePoints.map((point) => [point.objectId, point]));
    const damagePolygonsById = new Map(datedDamagePolygons.map((polygon) => [polygon.objectId, polygon]));

    for (let offset = 0; offset < tracks.length; offset += 4) {
      const batch = tracks.slice(offset, offset + 4);
      const related = await Promise.all(batch.map(async (track) => {
        const [points, polygons] = await Promise.all([
          this.queryDamagePointsForTrack(track, { signal }),
          this.queryDamagePolygonsForTrack(track, { signal }),
        ]);
        return { points, polygons };
      }));
      related.forEach(({ points, polygons }) => {
        points.forEach((point) => damagePointsById.set(point.objectId, point));
        polygons.forEach((polygon) => damagePolygonsById.set(polygon.objectId, polygon));
      });
    }

    return {
      tracks,
      damagePoints: [...damagePointsById.values()],
      damagePolygons: [...damagePolygonsById.values()],
      loadedAt: new Date().toISOString(),
    };
  }

  async queryDamagePointAttachments(objectId: number, signal?: AbortSignal): Promise<DatAttachment[]> {
    const params = new URLSearchParams({ objectIds: String(objectId), f: 'pjson' });
    const url = `${this.serviceUrl}/${DAT_LAYER_IDS.damagePoints}/queryAttachments?${params.toString()}`;
    const payload = await this.requestJson<{
      attachmentGroups?: Array<{ parentObjectId?: number; attachmentInfos?: Array<Record<string, unknown>> }>;
    }>(url, signal);
    const group = payload.attachmentGroups?.find((candidate) => candidate.parentObjectId === objectId);
    return (group?.attachmentInfos ?? []).flatMap((attachment) => {
      const id = asNumber(attachment.id ?? attachment.attachmentid);
      if (id === null) {
        return [];
      }
      return [{
        id,
        name: asString(attachment.name ?? attachment.att_name) ?? `attachment-${id}`,
        contentType: asString(attachment.contentType ?? attachment.content_type),
        size: asNumber(attachment.size ?? attachment.data_size),
        globalId: asString(attachment.globalId ?? attachment.globalid),
        parentGlobalId: asString(attachment.parentGlobalId),
      }];
    });
  }

  getAttachmentUrl(objectId: number, attachmentId: number): string {
    return `${this.serviceUrl}/${DAT_LAYER_IDS.damagePoints}/${objectId}/attachments/${attachmentId}`;
  }
}

export const datClient = new DatClient();

export const queryDatTracks = (options?: DatQueryOptions): Promise<DatTrack[]> => datClient.queryTracks(options);
export const queryDatDamagePoints = (options?: DatQueryOptions): Promise<DatDamagePoint[]> => datClient.queryDamagePoints(options);
export const queryDatDamagePolygons = (options?: DatQueryOptions): Promise<DatDamagePolygon[]> => datClient.queryDamagePolygons(options);
export const queryDatEvidenceForDate = (timeRange: DatDateRange, signal?: AbortSignal): Promise<DatEvidence> =>
  datClient.queryEvidenceForDate(timeRange, signal);
export const queryDatDamagePointAttachments = (objectId: number, signal?: AbortSignal): Promise<DatAttachment[]> =>
  datClient.queryDamagePointAttachments(objectId, signal);
export const getDatAttachmentUrl = (objectId: number, attachmentId: number): string =>
  datClient.getAttachmentUrl(objectId, attachmentId);
