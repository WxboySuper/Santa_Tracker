import type { StormReport } from '../../types/stormReports';
import { forecastProbabilityAt, isWithinNeighborhood, type ProductContour, type VerificationGrid } from './neighborhood';

/** Per-cell forecast probability and observed occurrence over the grid. */
export interface GridEvaluation {
  forecast: number[];
  observed: number[];
  observedFrequency: number;
  forecastCellCount: number;
  cellCount: number;
}

export const roundTo = (value: number, digits = 3): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Evaluates the forecast probability and observed fields on the grid. */
export const evaluateGrid = (
  grid: VerificationGrid,
  contours: ProductContour[],
  reports: StormReport[]
): GridEvaluation => {
  const forecast: number[] = [];
  const observed: number[] = [];
  let observedTotal = 0;
  let forecastCellCount = 0;

  for (const point of grid.points) {
    const f = forecastProbabilityAt(point, contours);
    const o = isWithinNeighborhood(point, reports) ? 1 : 0;
    forecast.push(f);
    observed.push(o);
    observedTotal += o;
    if (f > 0) {
      forecastCellCount += 1;
    }
  }

  const cellCount = grid.points.length;
  return {
    forecast,
    observed,
    observedFrequency: cellCount > 0 ? observedTotal / cellCount : 0,
    forecastCellCount,
    cellCount,
  };
};

export const isGradableEvaluation = (evaluation: GridEvaluation): boolean => {
  if (evaluation.cellCount <= 0) {
    return false;
  }
  return evaluation.forecastCellCount > 0 || evaluation.observedFrequency > 0;
};
