import * as turf from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import type { StormReport } from '../../types/stormReports';
import {
  SEVERITY_SIG_DRAWN_NONE_OBSERVED,
  SEVERITY_SIG_HIT,
  SEVERITY_SIG_MISSED,
  SEVERITY_SIG_OUT_OF_AREA,
} from './constants';
import { scoreEventYield, scoreSeverity } from './yieldSeverity';
import type { ProductContour } from './neighborhood';

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

const tornadoReport = (id: string, longitude: number, latitude: number, magnitude = '0'): StormReport => ({
  id,
  type: 'tornado',
  longitude,
  latitude,
  time: '2026-05-01T00:00:00Z',
  magnitude,
  location: 'Test',
  county: 'Test',
  state: 'OK',
});

const windReport = (id: string, longitude: number, latitude: number): StormReport => ({
  id,
  type: 'wind',
  longitude,
  latitude,
  time: '2026-05-01T00:00:00Z',
  magnitude: '60',
  location: 'Test',
  county: 'Test',
  state: 'OK',
});

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
    const contours = [
      contour(0.15, false, 0.1),
      contour(0.3, false, 0.1),
      contour(0.45, false, 0.1),
    ];
    const result = scoreEventYield('tornado', contours, [tornadoReport('a', 0, 0, '0')]);

    expect(result.applicable).toBe(true);
    if (result.score === null) {
      throw new Error('expected a finite score');
    }
    expect(result.score).toBeLessThan(1);
    expect(result.score).toBeGreaterThan(0.4);
  });

  it('punishes a huge 30% core with a single report (yield near zero)', () => {
    const contours = [
      contour(0.15, false, 1),
      contour(0.3, false, 1),
      contour(0.45, false, 1),
    ];
    const result = scoreEventYield('tornado', contours, [tornadoReport('a', 0, 0, '0')]);

    expect(result.applicable).toBe(true);
    if (result.score === null) {
      throw new Error('expected a finite score');
    }
    expect(result.score).toBeLessThan(0.4);
  });

  it('averages yield across present cores', () => {
    const tinyContours = [
      contour(0.15, false, 0.1),
      contour(0.3, false, 0.1),
      contour(0.45, false, 0.1),
    ];
    const expectedTinyAverage = 0.816;
    const actual = scoreEventYield('tornado', tinyContours, [tornadoReport('a', 0, 0, '0')]);
    if (actual.score === null) {
      throw new Error('expected a finite score');
    }
    expect(actual.score).toBeCloseTo(expectedTinyAverage, 2);
  });

  it('zeroes yield when no reports observe the drawn core', () => {
    const contours = [
      contour(0.15, false, 0.1),
      contour(0.3, false, 0.1),
      contour(0.45, false, 0.1),
    ];
    const result = scoreEventYield('tornado', contours, []);
    expect(result.applicable).toBe(true);
    expect(result.score).toBe(0);
  });

  it('filters reports to the supplied product so other hazards do not count', () => {
    const contours = [
      contour(0.15, false, 0.1),
      contour(0.3, false, 0.1),
      contour(0.45, false, 0.1),
    ];
    const windOnly = scoreEventYield('tornado', contours, [windReport('w1', 0, 0)]);
    const tornadoInside = scoreEventYield('tornado', contours, [tornadoReport('t1', 0, 0, '0')]);
    const mixed = scoreEventYield(
      'tornado',
      contours,
      [tornadoReport('t1', 0, 0, '0'), windReport('w1', 0, 0)]
    );

    if (windOnly.score === null || tornadoInside.score === null || mixed.score === null) {
      throw new Error('expected finite scores');
    }
    expect(windOnly.score).toBe(0);
    expect(mixed.score).toBeCloseTo(tornadoInside.score, 6);
  });
});

describe('scoreSeverity', () => {
  const sigContour = contour(0.6, true, 0.5);
  const nonSigReportInside = tornadoReport('tornado-ef0', 0, 0, '0');
  const nonSigReportOutside = tornadoReport('tornado-ef0-far', 10, 10, '0');
  const sigReportInside = tornadoReport('tornado-ef2', 0, 0, '2');
  const sigReportOutside = tornadoReport('tornado-ef2-far', 10, 10, '2');

  it('returns a hit when a significant report falls within the significant contour', () => {
    const result = scoreSeverity('tornado', [sigContour], [sigReportInside]);
    expect(result.applicable).toBe(true);
    expect(result.score).toBe(SEVERITY_SIG_HIT);
    expect(result.metrics).toEqual({ sigReports: 1, sigInArea: 1 });
  });

  it('returns out-of-area when sig reports exist but none fall inside the significant contour', () => {
    const result = scoreSeverity('tornado', [sigContour], [sigReportOutside]);
    expect(result.applicable).toBe(true);
    expect(result.score).toBe(SEVERITY_SIG_OUT_OF_AREA);
    expect(result.metrics).toEqual({ sigReports: 1, sigInArea: 0 });
  });

  it('soft-penalizes when a significant contour is drawn but no significant report is observed', () => {
    const result = scoreSeverity('tornado', [sigContour], [nonSigReportOutside]);
    expect(result.applicable).toBe(true);
    expect(result.score).toBe(SEVERITY_SIG_DRAWN_NONE_OBSERVED);
    expect(result.metrics).toEqual({ sigReports: 0, sigInArea: 0 });
  });

  it('returns missed when a significant report is observed but no significant contour was drawn', () => {
    const result = scoreSeverity('tornado', [contour(0.3, false, 0.5)], [sigReportInside]);
    expect(result.applicable).toBe(true);
    expect(result.score).toBe(SEVERITY_SIG_MISSED);
    expect(result.metrics).toEqual({ sigReports: 1, sigInArea: 0 });
  });

  it('returns not evaluated when neither significant contour nor significant report is present', () => {
    const result = scoreSeverity('tornado', [contour(0.3, false, 0.5)], [nonSigReportOutside]);
    expect(result.applicable).toBe(false);
    expect(result.score).toBeNull();
    expect(result.detail).toMatch(/no significant contour drawn/i);
  });

  it('filters reports to the supplied product so other hazards do not count', () => {
    const result = scoreSeverity('tornado', [sigContour], [windReport('w1', 0, 0)]);
    expect(result.applicable).toBe(true);
    expect(result.score).toBe(SEVERITY_SIG_DRAWN_NONE_OBSERVED);
  });
});
