import * as turf from '@turf/turf';
import type { StormReport } from '../../types/stormReports';
import {
  evaluateGrid,
  isGradableEvaluation,
  roundTo,
  type GridEvaluation,
} from './gridEvaluation';
import type { ProductContour, VerificationGrid } from './neighborhood';

const squarePolygon = (
  west: number,
  south: number,
  east: number,
  north: number
) =>
  turf.polygon([
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ]) as ProductContour['polygon'];

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

const contour = (probability: number, polygon: ProductContour['polygon']): ProductContour => ({
  probability,
  isSignificant: false,
  polygon,
});

const grid = (points: [number, number][]): VerificationGrid => ({
  points,
  spacingKm: 10,
});

describe('gridEvaluation', () => {
  describe('roundTo', () => {
    it('rounds to the requested number of digits', () => {
      expect(roundTo(0.123456, 3)).toBe(0.123);
      expect(roundTo(0.123456, 2)).toBe(0.12);
      expect(roundTo(0.5)).toBe(0.5);
    });
  });

  describe('evaluateGrid', () => {
    it('returns an empty evaluation for an empty grid', () => {
      const evaluation = evaluateGrid(grid([]), [], []);
      expect(evaluation.cellCount).toBe(0);
      expect(evaluation.forecast).toEqual([]);
      expect(evaluation.observed).toEqual([]);
      expect(evaluation.forecastCellCount).toBe(0);
      expect(evaluation.observedFrequency).toBe(0);
    });

    it('records observed frequency when only reports are present', () => {
      const inside = turf.destination([-97, 35], 5, 0, { units: 'miles' }).geometry
        .coordinates as [number, number];
      const farAway = [-120, 45] as [number, number];
      const evaluation = evaluateGrid(grid([inside, farAway]), [], [report()]);

      expect(evaluation.cellCount).toBe(2);
      expect(evaluation.observed).toEqual([1, 0]);
      expect(evaluation.observedFrequency).toBe(0.5);
      expect(evaluation.forecastCellCount).toBe(0);
    });

    it('selects the maximum probability from overlapping contours', () => {
      const points: [number, number][] = [[-97, 35]];
      const contours = [
        contour(0.1, squarePolygon(-98, 34, -96, 36)),
        contour(0.3, squarePolygon(-97.5, 34.5, -96.5, 35.5)),
        contour(0.05, squarePolygon(-100, 33, -95, 37)),
      ];
      const evaluation = evaluateGrid(grid(points), contours, []);

      expect(evaluation.forecast).toEqual([0.3]);
      expect(evaluation.forecastCellCount).toBe(1);
    });

    it('counts forecastCellCount only for cells with positive forecast probability', () => {
      const contours = [contour(0.1, squarePolygon(-98, 34, -96, 36))];
      const points: [number, number][] = [
        [-97, 35],
        [-120, 45],
        [-97.2, 35.2],
      ];
      const evaluation = evaluateGrid(grid(points), contours, []);

      expect(evaluation.forecast).toEqual([0.1, 0, 0.1]);
      expect(evaluation.forecastCellCount).toBe(2);
    });

    it('computes observed frequency as the share of cells inside a 25-mile halo', () => {
      const origin = report({ latitude: 35, longitude: -97 });
      const inside1 = turf.destination([-97, 35], 10, 0, { units: 'miles' }).geometry
        .coordinates as [number, number];
      const inside2 = turf.destination([-97, 35], 20, 90, { units: 'miles' }).geometry
        .coordinates as [number, number];
      const outside = [-120, 45] as [number, number];

      const evaluation = evaluateGrid(grid([inside1, inside2, outside]), [], [origin]);

      expect(evaluation.observed).toEqual([1, 1, 0]);
      expect(evaluation.observedFrequency).toBeCloseTo(2 / 3, 5);
    });
  });

  describe('isGradableEvaluation', () => {
    const baseEvaluation: GridEvaluation = {
      forecast: [0, 0, 0],
      observed: [0, 0, 0],
      observedFrequency: 0,
      forecastCellCount: 0,
      cellCount: 3,
    };

    it('is not gradable for an empty grid', () => {
      expect(isGradableEvaluation({ ...baseEvaluation, cellCount: 0 })).toBe(false);
    });

    it('is gradable when forecasts paint at least one cell', () => {
      expect(
        isGradableEvaluation({ ...baseEvaluation, forecast: [0.1, 0, 0], forecastCellCount: 1 })
      ).toBe(true);
    });

    it('is gradable when observed frequency is positive even with no paint', () => {
      expect(
        isGradableEvaluation({ ...baseEvaluation, observed: [1, 0, 0], observedFrequency: 1 / 3 })
      ).toBe(true);
    });

    it('is not gradable when neither forecast nor observations contribute', () => {
      expect(isGradableEvaluation(baseEvaluation)).toBe(false);
    });
  });
});
