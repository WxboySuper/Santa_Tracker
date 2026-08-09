import type { Feature, LineString, MultiLineString, MultiPolygon, Point, Polygon } from 'geojson';

export type DatTrackGeometry = LineString | MultiLineString;
export type DatDamagePolygonGeometry = Polygon | MultiPolygon;

export interface DatTrack {
  objectId: number;
  globalId: string | null;
  eventId: string | null;
  stormDate: string | null;
  startTime: string | null;
  endTime: string | null;
  startLat: number | null;
  startLon: number | null;
  endLat: number | null;
  endLon: number | null;
  /** NOAA DAT source value. The service does not publish field units. */
  length: number | null;
  /** NOAA DAT source value. The service does not publish field units. */
  width: number | null;
  injuries: number | null;
  fatalities: number | null;
  efScale: string | null;
  efNumber: number | null;
  maxWind: number | null;
  wfo: string | null;
  comments: string | null;
  geometry: Feature<DatTrackGeometry>['geometry'];
}

export interface DatDamagePoint {
  objectId: number;
  globalId: string | null;
  pathGuid: string | null;
  eventId: string | null;
  stormDate: string | null;
  surveyDate: string | null;
  damage: number | string | null;
  damageText: string | null;
  degreeOfDamage: number | string | null;
  degreeOfDamageText: string | null;
  efScale: string | null;
  windSpeed: number | null;
  damageDirection: string | null;
  injuries: number | null;
  deaths: number | null;
  office: string | null;
  surveyType: string | null;
  comments: string | null;
  image: string | null;
  latitude: number | null;
  longitude: number | null;
  geometry: Feature<Point>['geometry'];
}

export interface DatDamagePolygon {
  objectId: number;
  globalId: string | null;
  pathGuid: string | null;
  eventId: string | null;
  stormDate: string | null;
  efScale: string | null;
  /** NOAA DAT source value. The service does not publish field units. */
  length: number | null;
  /** NOAA DAT source value. The service does not publish field units. */
  width: number | null;
  injuries: number | null;
  fatalities: number | null;
  comments: string | null;
  geometry: Feature<DatDamagePolygonGeometry>['geometry'];
}

export interface DatAttachment {
  id: number;
  name: string;
  contentType: string | null;
  size: number | null;
  globalId: string | null;
  parentGlobalId: string | null;
}

export interface DatEvidence {
  tracks: DatTrack[];
  damagePoints: DatDamagePoint[];
  damagePolygons: DatDamagePolygon[];
  loadedAt: string;
}

export interface DatEvidenceSummary {
  trackCount: number;
  damagePointCount: number;
  damagePolygonCount: number;
  tornadoTrackCount: number;
  tornadoDamagePointCount: number;
  tornadoDamagePolygonCount: number;
}

export interface DatDateRange {
  start: string | number | Date;
  end: string | number | Date;
}

export interface DatBoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface DatQueryOptions {
  where?: string;
  outFields?: readonly string[];
  timeRange?: DatDateRange;
  bounds?: DatBoundingBox;
  orderByFields?: string;
  signal?: AbortSignal;
  pageSize?: number;
}
