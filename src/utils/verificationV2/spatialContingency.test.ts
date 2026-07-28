import * as turf from '@turf/turf';
import type { StormReport } from '../../types/stormReports';
import { scoreSpatialContingency } from './spatialContingency';
import type { ProductContour } from './neighborhood';

const squarePolygon = (
  west: number,
  south: number,
  east: number,
  north: number
): ProductContour['polygon'] =>
  turf.polygon([
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ]) as ProductContour['polygon'];

const contour = (probability: number, polygon: ProductContour['polygon']): ProductContour => ({
  probability,
  isSignificant: false,
  polygon,
});

const report = (overrides: Partial<StormReport> = {}): StormReport => ({
  id: 'r1',
  type: 'tornado',
  latitude: 35,
  longitude: -97,
  time: '2026-07-25T18:00:00Z',
  location: 'Norman',
  county: 'Cleveland',
  state: 'OK',
  ...overrides,
});

describe('scoreSpatialContingency', () => {
  it('returns not evaluated when there is no forecast area and no observed footprint', () => {
    const result = scoreSpatialContingency([], []);
    expect(result.applicable).toBe(false);
    expect(result.score).toBeNull();
    expect(result.key).toBe('spatialContingency');
  });

  it('returns not evaluated for contours with only zero probability paint', () => {
    const result = scoreSpatialContingency(
      [contour(0, squarePolygon(-98, 34, -96, 36))],
      []
    );
    expect(result.applicable).toBe(false);
    expect(result.score).toBeNull();
  });

  it('scores a forecast-only setup at zero CSI with all false alarms', () => {
    const result = scoreSpatialContingency(
      [contour(0.1, squarePolygon(-98, 34, -96, 36))],
      []
    );
    expect(result.applicable).toBe(true);
    expect(result.score).toBe(0);
    expect(result.metrics?.falseAlarmAreaKm2).toBeGreaterThan(0);
    expect(result.metrics?.missAreaKm2).toBe(0);
    expect(result.metrics?.tiers).toBe(1);
  });

  it('scores an observation-only setup at zero CSI with all misses', () => {
    const result = scoreSpatialContingency([], [report({ latitude: 35, longitude: -97 })]);
    expect(result.applicable).toBe(true);
    expect(result.score).toBe(0);
    expect(result.metrics?.missAreaKm2).toBeGreaterThan(0);
    expect(result.metrics?.hitAreaKm2).toBe(0);
  });

  it('averages CSI across probability tiers', () => {
    // A 10% contour around Norman with a 5% contour covering a wider area.
    // No reports → each tier reports a hit of 0, false alarm = tier area, miss = 0
    // → per-tier CSI is 0 → average is 0, union CSI is also 0.
    const contours = [
      contour(0.1, squarePolygon(-97.5, 34.5, -96.5, 35.5)),
      contour(0.05, squarePolygon(-98, 34, -96, 36)),
    ];
    const result = scoreSpatialContingency(contours, []);
    expect(result.applicable).toBe(true);
    expect(result.metrics?.tiers).toBe(2);
    expect(result.score).toBe(0);
  });

  it('averages tier CSI for a perfect forecast with a matching report', () => {
    // Single 10% contour around Norman with a tornado report inside.
    // Tier union = forecast; observed footprint = 25-mile buffer around the report.
    // Hit area will be > 0; expected CSI > 0.
    const contours = [contour(0.1, squarePolygon(-97.5, 34.5, -96.5, 35.5))];
    const result = scoreSpatialContingency(contours, [report({ latitude: 35, longitude: -97 })]);
    expect(result.applicable).toBe(true);
    expect(result.metrics?.hitAreaKm2).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it('ignores zero-probability contours when computing the union and tiers', () => {
    const paintable = contour(0.1, squarePolygon(-97.5, 34.5, -96.5, 35.5));
    const zero = contour(0, squarePolygon(-99, 33, -95, 37));
    const resultWithZero = scoreSpatialContingency([paintable, zero], []);
    const resultWithoutZero = scoreSpatialContingency([paintable], []);

    expect(resultWithZero.metrics?.tiers).toBe(resultWithoutZero.metrics?.tiers);
    expect(resultWithZero.metrics?.falseAlarmAreaKm2).toBeCloseTo(
      resultWithoutZero.metrics?.falseAlarmAreaKm2 ?? -1,
      5
    );
  });
});
