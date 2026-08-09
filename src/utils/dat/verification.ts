import type { StormReport } from '../../types/stormReports';
import type { DatDamagePoint, DatEvidence } from './types';

/** DAT EF-coded survey points are tornado damage evidence; Wind/TSTM points are not. */
export const isTornadoDamagePoint = (point: DatDamagePoint): boolean =>
  /^EF(?:[0-5]|U)$/i.test(point.efScale ?? '');

export const datDamagePointToStormReport = (point: DatDamagePoint): StormReport | null => {
  if (!isTornadoDamagePoint(point) || point.latitude === null || point.longitude === null) {
    return null;
  }
  return {
    id: `dat-${point.objectId}`,
    type: 'tornado',
    latitude: point.latitude,
    longitude: point.longitude,
    time: point.surveyDate ?? point.stormDate ?? '',
    magnitude: point.efScale ?? undefined,
    location: 'NOAA DAT survey point',
    county: '',
    state: '',
    comments: point.comments ?? point.damageText ?? undefined,
    source: 'DAT',
  };
};

export const tornadoDamagePoints = (evidence?: DatEvidence): DatDamagePoint[] =>
  evidence?.damagePoints.filter(isTornadoDamagePoint) ?? [];

export const summarizeDatEvidence = (evidence?: DatEvidence) => {
  const tracks = evidence?.tracks ?? [];
  const damagePoints = evidence?.damagePoints ?? [];
  const damagePolygons = evidence?.damagePolygons ?? [];
  return {
    trackCount: tracks.length,
    damagePointCount: damagePoints.length,
    damagePolygonCount: damagePolygons.length,
    tornadoTrackCount: tracks.filter((track) => /^EF(?:[0-5]|U)$/i.test(track.efScale ?? '')).length,
    tornadoDamagePointCount: damagePoints.filter(isTornadoDamagePoint).length,
    tornadoDamagePolygonCount: damagePolygons.filter((polygon) => /^EF(?:[0-5]|U)$/i.test(polygon.efScale ?? '')).length,
  };
};
