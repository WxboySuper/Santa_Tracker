import type { DatDamagePoint } from './types';
import { datDamagePointToStormReport, isTornadoDamagePoint, summarizeDatEvidence } from './verification';

const point = (efScale: string): DatDamagePoint => ({
  objectId: 1,
  globalId: null,
  pathGuid: null,
  eventId: null,
  stormDate: null,
  surveyDate: '2026-08-01T00:00:00.000Z',
  damage: null,
  damageText: 'Roof damage',
  degreeOfDamage: null,
  degreeOfDamageText: null,
  efScale,
  windSpeed: null,
  damageDirection: null,
  injuries: null,
  deaths: null,
  office: 'OUN',
  surveyType: null,
  comments: null,
  image: null,
  latitude: 35,
  longitude: -97,
  geometry: { type: 'Point', coordinates: [-97, 35] },
});

describe('DAT verification normalization', () => {
  test('keeps EF-coded survey points as tornado evidence and excludes wind records', () => {
    expect(isTornadoDamagePoint(point('EF3'))).toBe(true);
    expect(isTornadoDamagePoint(point('EFU'))).toBe(true);
    expect(isTornadoDamagePoint(point('Wind'))).toBe(false);
    expect(datDamagePointToStormReport(point('EF3'))).toMatchObject({ type: 'tornado', source: 'DAT', magnitude: 'EF3' });
  });

  test('summarizes the evidence source by total and tornado records', () => {
    const evidence = {
      tracks: [{ efScale: 'EF2' }, { efScale: 'Wind' }],
      damagePoints: [point('EF2'), point('Wind')],
      damagePolygons: [{ efScale: 'EF1' }, { efScale: 'TSTM/Wind' }],
      loadedAt: '2026-08-01T00:00:00.000Z',
    } as never;

    expect(summarizeDatEvidence(evidence)).toEqual({
      trackCount: 2,
      damagePointCount: 2,
      damagePolygonCount: 2,
      tornadoTrackCount: 1,
      tornadoDamagePointCount: 1,
      tornadoDamagePolygonCount: 1,
    });
  });
});
