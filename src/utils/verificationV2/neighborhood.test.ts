import * as turf from '@turf/turf';
import type { Feature, Point } from 'geojson';
import type { OutlookData } from '../../types/outlooks';
import type { StormReport } from '../../types/stormReports';
import {
  GRID_SPACING_KM,
  MAX_GRID_CELLS,
  SPC_NEIGHBORHOOD_MILES,
} from './constants';
import {
  areaKm2,
  buildVerificationGrid,
  estimateGridCellCount,
  extractProductContours,
  forecastProbabilityAt,
  gridEndpointCount,
  intersectionAreaKm2,
  isCigKey,
  isSignificantKey,
  isSignificantReport,
  isWithinNeighborhood,
  observedFootprint,
  parseMagnitude,
  probabilityFromKey,
  reportsForProduct,
  reportsNearRegion,
  unionAll,
  type AreaPolygon,
} from './neighborhood';

const squarePolygon = (
  west: number,
  south: number,
  east: number,
  north: number
): AreaPolygon =>
  turf.polygon([
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ]) as AreaPolygon;

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

describe('neighborhood', () => {
  describe('probability and significance parsing', () => {
    it('parses contour key probabilities and significance markers', () => {
      expect(probabilityFromKey('tornado', '15%')).toBe(0.15);
      expect(probabilityFromKey('wind', '30%#')).toBe(0.3);
      expect(probabilityFromKey('hail', 'not-a-probability')).toBe(0);
      expect(probabilityFromKey('tornado', 'CIG2')).toBe(0);
      expect(isCigKey('CIG1')).toBe(true);
      expect(isCigKey('CIG2')).toBe(true);
      expect(isCigKey('15%')).toBe(false);
      expect(isSignificantKey('15%#')).toBe(true);
      expect(isSignificantKey('15%')).toBe(false);
    });

    it('parses report magnitudes and significance thresholds', () => {
      expect(parseMagnitude(report({ magnitude: 'EF2' }))).toBe(2);
      expect(parseMagnitude(report({ magnitude: undefined }))).toBe(0);
      expect(parseMagnitude(report({ magnitude: 'bad' }))).toBe(0);
      expect(isSignificantReport(report({ type: 'wind', magnitude: '80 mph' }))).toBe(true);
      expect(isSignificantReport(report({ type: 'wind', magnitude: '60 mph' }))).toBe(false);
    });
  });

  describe('extractProductContours', () => {
    it('extracts valid polygons and skips malformed features', () => {
      const outlooks: OutlookData = {
        tornado: new Map([
          [
            '15%#',
            [
              squarePolygon(-98, 34, -96, 36),
              turf.point([-97, 35]) as Feature<Point>,
            ],
          ],
        ]),
      };

      const contours = extractProductContours(outlooks, 'tornado');
      expect(contours).toHaveLength(1);
      expect(contours[0]).toEqual(
        expect.objectContaining({ probability: 0.15, isSignificant: true })
      );
    });

    it('returns an empty list when the product map is missing', () => {
      expect(extractProductContours({}, 'wind')).toEqual([]);
    });

    it('recognizes serialized CIG keys and feature significance metadata', () => {
      const outlooks: OutlookData = {
        wind: new Map([
          ['CIG2', [
            squarePolygon(-98, 34, -96, 36),
          ]],
          ['15%', [
            {
              type: 'Feature',
              properties: { isSignificant: true },
              geometry: squarePolygon(-97.5, 34.5, -96.5, 35.5).geometry,
            } as AreaPolygon,
          ]],
        ]),
      };

      const contours = extractProductContours(outlooks, 'wind');
      expect(contours).toHaveLength(2);
      expect(contours.find((contour) => contour.probability === 0))
        .toEqual(expect.objectContaining({ isSignificant: true }));
      expect(contours.find((contour) => contour.probability === 0.15))
        .toEqual(expect.objectContaining({ isSignificant: true }));
    });
  });

  describe('reportsForProduct', () => {
    it('keeps only reports for the requested hazard', () => {
      const reports = [
        report({ id: 't1', type: 'tornado' }),
        report({ id: 'w1', type: 'wind' }),
      ];
      expect(reportsForProduct(reports, 'tornado')).toHaveLength(1);
      expect(reportsForProduct(reports, 'tornado')[0].id).toBe('t1');
    });
  });

  describe('polygon operations', () => {
    it('unions overlapping polygons and computes area/intersection', () => {
      const left = squarePolygon(-99, 34, -97, 36);
      const right = squarePolygon(-98, 34, -96, 36);
      const merged = unionAll([left, right]);
      expect(merged).not.toBeNull();
      expect(areaKm2(merged)).toBeGreaterThan(areaKm2(left));
      expect(intersectionAreaKm2(left, right)).toBeGreaterThan(0);
      expect(unionAll([])).toBeNull();
    });
  });

  describe('25-mile neighborhood behavior', () => {
    it('treats points inside the radius as in-neighborhood and outside as not', () => {
      const origin = report({ latitude: 35, longitude: -97 });
      const inside = turf.destination([-97, 35], SPC_NEIGHBORHOOD_MILES - 0.1, 90, {
        units: 'miles',
      }).geometry.coordinates;
      const outside = turf.destination([-97, 35], SPC_NEIGHBORHOOD_MILES + 0.5, 90, {
        units: 'miles',
      }).geometry.coordinates;

      expect(isWithinNeighborhood(inside, [origin])).toBe(true);
      expect(isWithinNeighborhood(outside, [origin])).toBe(false);
    });

    it('buffers reports into an observed footprint and counts nearby reports', () => {
      const reports = [
        report({ id: 'a', latitude: 35, longitude: -97 }),
        report({ id: 'b', latitude: 36, longitude: -100 }),
      ];
      const footprint = observedFootprint(reports);
      expect(footprint).not.toBeNull();

      const region = squarePolygon(-97.5, 34.5, -96.5, 35.5);
      expect(reportsNearRegion(region, reports)).toBe(1);
    });

    it('selects the highest enclosing contour probability at a point', () => {
      const contours = [
        { probability: 0.15, isSignificant: false, polygon: squarePolygon(-98, 34, -96, 36) },
        { probability: 0.3, isSignificant: true, polygon: squarePolygon(-97.5, 34.5, -96.5, 35.5) },
      ];
      expect(forecastProbabilityAt([-97, 35], contours)).toBe(0.3);
      expect(forecastProbabilityAt([-120, 45], contours)).toBe(0);
    });
  });

  describe('gridEndpointCount and estimateGridCellCount', () => {
    it('uses endpoint-inclusive counts for square and thin envelopes', () => {
      expect(gridEndpointCount(100, 10)).toBe(11);
      expect(gridEndpointCount(5, 10)).toBe(1);
      expect(estimateGridCellCount(100, 20, 10)).toBe(11 * 3);
      expect(estimateGridCellCount(2000, 2000, 10)).toBeGreaterThan(MAX_GRID_CELLS);
    });
  });

  describe('buildVerificationGrid', () => {
    it('returns an empty grid when no envelope is available', () => {
      expect(buildVerificationGrid(null, null)).toEqual({
        points: [],
        spacingKm: GRID_SPACING_KM,
      });
    });

    it('builds a modest grid for a small envelope', () => {
      const forecast = squarePolygon(-98, 34, -96, 36);
      const grid = buildVerificationGrid(forecast, null);
      expect(grid.points.length).toBeGreaterThan(0);
      expect(grid.points.length).toBeLessThanOrEqual(MAX_GRID_CELLS);
      expect(grid.spacingKm).toBe(GRID_SPACING_KM);
    });

    it('coarsens spacing so square and thin continental envelopes stay under the cell cap', () => {
      const continentalSquare = squarePolygon(-125, 24, -66, 50);
      const thinEnvelope = squarePolygon(-125, 35, -66, 36);

      const squareGrid = buildVerificationGrid(continentalSquare, null);
      const thinGrid = buildVerificationGrid(thinEnvelope, null);

      expect(squareGrid.points.length).toBeLessThanOrEqual(MAX_GRID_CELLS);
      expect(thinGrid.points.length).toBeLessThanOrEqual(MAX_GRID_CELLS);
      expect(squareGrid.spacingKm).toBeGreaterThan(GRID_SPACING_KM);
      expect(
        estimateGridCellCount(
          turf.distance([-125, 24], [-66, 24], { units: 'kilometers' }),
          turf.distance([-125, 24], [-125, 50], { units: 'kilometers' }),
          squareGrid.spacingKm
        )
      ).toBeLessThanOrEqual(MAX_GRID_CELLS);
    });
  });
});
