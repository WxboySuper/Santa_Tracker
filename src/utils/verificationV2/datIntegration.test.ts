import type { DatEvidence } from '../dat';
import { gradeForecast } from './gradeForecast';

const tornadoContour = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[-98, 34], [-96, 34], [-96, 36], [-98, 36], [-98, 34]]] },
  properties: {},
} as never;

const datEvidence: DatEvidence = {
  tracks: [{ efScale: 'EF3' }] as never,
  damagePoints: [{
    objectId: 101,
    globalId: null,
    pathGuid: null,
    eventId: null,
    stormDate: null,
    surveyDate: '2026-08-01T00:00:00.000Z',
    damage: null,
    damageText: 'Destroyed home',
    degreeOfDamage: null,
    degreeOfDamageText: null,
    efScale: 'EF3',
    windSpeed: 150,
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
  }],
  damagePolygons: [],
  loadedAt: '2026-08-01T00:00:00.000Z',
};

const outlooks = {
  tornado: new Map([['15#', [tornadoContour]]]),
  wind: new Map(),
  hail: new Map(),
  categorical: new Map(),
};

describe('DAT tornado grading prototype', () => {
  test('lets a surveyed EF point activate tornado severity evidence without an SPC report', () => {
    const result = gradeForecast({ outlooks, reports: [], datEvidence, generatedAt: '2026-08-02T00:00:00.000Z' });
    const tornado = result.products.find((product) => product.product === 'tornado');
    const severity = tornado?.components.find((component) => component.key === 'severity');

    expect(tornado?.datPointCount).toBe(1);
    expect(severity?.applicable).toBe(true);
    expect(severity?.detail).toContain('DAT survey');
    expect(result.datEvidence?.tornadoDamagePointCount).toBe(1);
    expect(result.hasReports).toBe(true);
  });
});
