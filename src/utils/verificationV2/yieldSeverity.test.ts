import * as turf from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import type { StormReport } from '../../types/stormReports';
import {
  SEVERITY_SIG_DRAWN_NONE_OBSERVED,
  SEVERITY_SIG_HIT,
  SEVERITY_SIG_MISSED,
  SEVERITY_SIG_OUT_OF_AREA,
} from './constants';
import type { ComponentScore } from './gradeContract';
import type { ProductContour } from './neighborhood';
import { scoreEventYield, scoreSeverity } from './yieldSeverity';

const squarePolygon = (sizeDeg: number): Feature<Polygon> => {
  const half = sizeDeg / 2;
  return turf.polygon([
    [
      [-half, -half],
      [-half, half],
      [half, half],
      [half, -half],
      [-half, -half],
    ],
  ]);
};

const contour = (probability: number, isSignificant: boolean, sizeDeg: number): ProductContour => ({
  probability,
  isSignificant,
  polygon: squarePolygon(sizeDeg),
});

const report = (
  id: string,
  type: StormReport['type'],
  longitude: number,
  latitude: number,
  magnitude: string
): StormReport => ({
  id,
  type,
  longitude,
  latitude,
  time: '2026-05-01T00:00:00Z',
  magnitude,
  location: 'Test',
  county: 'Test',
  state: 'OK',
});

const tinyCores = (sizeDeg: number): ProductContour[] => [
  contour(0.15, false, sizeDeg),
  contour(0.3, false, sizeDeg),
  contour(0.45, false, sizeDeg),
];

const finiteScore = (component: ComponentScore): number => {
  if (component.score === null) {
    throw new Error(`expected a finite score, got null (${component.detail})`);
  }
  return component.score;
};

describe('yieldSeverity', () => {
  it('exports callable scorers', () => {
    expect(typeof scoreEventYield).toBe('function');
    expect(typeof scoreSeverity).toBe('function');
  });
});

describe('scoreEventYield', () => {
  it('returns not evaluated when no probability core at or above 15% was drawn', () => {
    const result = scoreEventYield('tornado', [contour(0.1, false, 0.5)], []);
    expect(result.applicable).toBe(false);
    expect(result.score).toBeNull();
    expect(result.detail).toMatch(/no probability core/i);
  });

  it('softens a tiny high-probability core with a single report (yield well under 1)', () => {
    const score = finiteScore(scoreEventYield('tornado', tinyCores(0.1), [report('a', 'tornado', 0, 0, '0')]));
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThan(0.4);
  });

  it('punishes a huge 30% core with a single report (yield near zero)', () => {
    const score = finiteScore(scoreEventYield('tornado', tinyCores(1), [report('a', 'tornado', 0, 0, '0')]));
    expect(score).toBeLessThan(0.4);
  });

  it('averages yield across present cores', () => {
    const score = finiteScore(scoreEventYield('tornado', tinyCores(0.1), [report('a', 'tornado', 0, 0, '0')]));
    expect(score).toBeCloseTo(0.816, 2);
  });

  it('zeroes yield when no reports observe the drawn core', () => {
    const result = scoreEventYield('tornado', tinyCores(0.1), []);
    expect(result.applicable).toBe(true);
    expect(result.score).toBe(0);
  });

  it('filters reports to the supplied product so other hazards do not count', () => {
    const contours = tinyCores(0.1);
    const windOnly = scoreEventYield('tornado', contours, [report('w1', 'wind', 0, 0, '60')]);
    const tornadoInside = scoreEventYield('tornado', contours, [report('t1', 'tornado', 0, 0, '0')]);
    const mixed = scoreEventYield('tornado', contours, [
      report('t1', 'tornado', 0, 0, '0'),
      report('w1', 'wind', 0, 0, '60'),
    ]);

    expect(windOnly.score).toBe(0);
    expect(finiteScore(mixed)).toBeCloseTo(finiteScore(tornadoInside), 6);
  });
});

describe('scoreSeverity', () => {
  const sigContour = contour(0.6, true, 0.5);
  const nonSigContour = contour(0.3, false, 0.5);
  const sigReportInside = report('tornado-ef2', 'tornado', 0, 0, '2');
  const sigReportOutside = report('tornado-ef2-far', 'tornado', 10, 10, '2');
  const nonSigReportOutside = report('tornado-ef0-far', 'tornado', 10, 10, '0');
  const windReportInside = report('w1', 'wind', 0, 0, '60');

  const cases: ReadonlyArray<{
    name: string;
    contours: ProductContour[];
    reports: StormReport[];
    applicable: boolean;
    score: number | null;
    metrics?: Record<string, number>;
  }> = [
    {
      name: 'hit',
      contours: [sigContour],
      reports: [sigReportInside],
      applicable: true,
      score: SEVERITY_SIG_HIT,
      metrics: { sigReports: 1, sigInArea: 1, sigCoverage: 1 },
    },
    {
      name: 'out-of-area',
      contours: [sigContour],
      reports: [sigReportOutside],
      applicable: true,
      score: SEVERITY_SIG_OUT_OF_AREA,
      metrics: { sigReports: 1, sigInArea: 0 },
    },
    {
      name: 'drawn-only',
      contours: [sigContour],
      reports: [nonSigReportOutside],
      applicable: true,
      score: SEVERITY_SIG_DRAWN_NONE_OBSERVED,
      metrics: { sigReports: 0, sigInArea: 0 },
    },
    {
      name: 'observed-only',
      contours: [nonSigContour],
      reports: [sigReportInside],
      applicable: true,
      score: SEVERITY_SIG_MISSED,
      metrics: { sigReports: 1, sigInArea: 0 },
    },
    {
      name: 'not-evaluated',
      contours: [nonSigContour],
      reports: [nonSigReportOutside],
      applicable: false,
      score: null,
    },
    {
      name: 'product-filter-drops-other-hazard',
      contours: [sigContour],
      reports: [windReportInside],
      applicable: true,
      score: SEVERITY_SIG_DRAWN_NONE_OBSERVED,
      metrics: { sigReports: 0, sigInArea: 0 },
    },
  ];

  it.each(cases)('returns the $name outcome', ({ contours, reports, applicable, score, metrics }) => {
    const result = scoreSeverity('tornado', contours, reports);
    expect(result.applicable).toBe(applicable);
    expect(result.score).toBe(score);
    if (metrics) {
      expect(result.metrics).toEqual(metrics);
    }
  });

  it('surfaces a not-evaluated detail when no significant contour or report is present', () => {
    const result = scoreSeverity('tornado', [nonSigContour], [nonSigReportOutside]);
    expect(result.detail).toMatch(/no significant contour drawn/i);
  });
});
