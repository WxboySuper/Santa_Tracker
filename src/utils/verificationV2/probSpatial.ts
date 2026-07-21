import type { StormReport } from '../../types/stormReports';
import {
  clamp,
  notEvaluatedComponent,
  scoredComponent,
  type ComponentScore,
} from './gradeContract';
import {
  areaKm2,
  forecastProbabilityAt,
  intersectionAreaKm2,
  isWithinNeighborhood,
  observedFootprint,
  unionAll,
  type AreaPolygon,
  type ProductContour,
  type VerificationGrid,
} from './neighborhood';

/**
 * Probability-skill, spatial-contingency, and false-alarm-discipline components
 * (PR 03 — prob-spatial). All three read the same ~10 km grid so the forecast
 * probability field and observed event field are consistent across metrics.
 */

/** Per-cell forecast probability and observed occurrence over the grid. */
export interface GridEvaluation {
  forecast: number[];
  observed: number[];
  observedFrequency: number;
  forecastCellCount: number;
  cellCount: number;
}

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

const roundTo = (value: number, digits = 3): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * Probability skill via the spatial Brier Skill Score over the grid. Higher-`f`
 * empty cells hurt more (larger squared error). Quiet overforecast days still
 * score 0 rather than dropping out.
 */
export const scoreProbabilitySkill = (evaluation: GridEvaluation): ComponentScore => {
  const { forecast, observed, observedFrequency, cellCount } = evaluation;
  const hasForecast = evaluation.forecastCellCount > 0;

  if (cellCount === 0 || (!hasForecast && observedFrequency === 0)) {
    return notEvaluatedComponent('probabilitySkill', 'No forecast probability field and no reports on the grid.');
  }

  let squaredError = 0;
  for (let index = 0; index < cellCount; index += 1) {
    const diff = forecast[index] - observed[index];
    squaredError += diff * diff;
  }
  const brier = squaredError / cellCount;

  if (observedFrequency === 0) {
    return scoredComponent(
      'probabilitySkill',
      0,
      `Brier ${roundTo(brier)} against zero observed frequency (overforecast).`,
      { brier: roundTo(brier), observedFrequency: 0, cells: cellCount }
    );
  }

  const referenceBrier = observedFrequency * (1 - observedFrequency);
  const skill = referenceBrier > 0 ? clamp(1 - brier / referenceBrier) : 0;

  return scoredComponent(
    'probabilitySkill',
    skill,
    `Brier ${roundTo(brier)}, BSS ${roundTo(1 - brier / referenceBrier)} vs climatology ${roundTo(
      observedFrequency
    )}.`,
    {
      brier: roundTo(brier),
      bss: roundTo(1 - brier / referenceBrier),
      observedFrequency: roundTo(observedFrequency),
      cells: cellCount,
    }
  );
};

/** Distinct forecast probability tiers present in the contours, ascending. */
const tiersFrom = (contours: ProductContour[]): number[] =>
  Array.from(new Set(contours.map((contour) => contour.probability).filter((p) => p > 0))).sort(
    (a, b) => a - b
  );

/**
 * Spatial contingency via the Armchair-style area method. For each probability
 * tier the forecast area (prob ≥ tier) is compared to the observed footprint to
 * derive hit / miss / false-alarm areas and a per-tier CSI, then averaged.
 */
export const scoreSpatialContingency = (
  contours: ProductContour[],
  reports: StormReport[]
): ComponentScore => {
  const forecastUnion = unionAll(contours.map((contour) => contour.polygon));
  const observed = observedFootprint(reports);

  if (!forecastUnion && !observed) {
    return notEvaluatedComponent('spatialContingency', 'No forecast area and no observed footprint.');
  }

  const observedArea = areaKm2(observed);
  const tiers = tiersFrom(contours);

  const perTierCsi: number[] = [];
  for (const tier of tiers) {
    const tierUnion = unionAll(
      contours.filter((contour) => contour.probability >= tier).map((contour) => contour.polygon)
    );
    const tierArea = areaKm2(tierUnion);
    const hit = intersectionAreaKm2(tierUnion, observed);
    const falseAlarm = Math.max(0, tierArea - hit);
    const miss = Math.max(0, observedArea - hit);
    const denom = hit + falseAlarm + miss;
    perTierCsi.push(denom > 0 ? hit / denom : 0);
  }

  const unionHit = intersectionAreaKm2(forecastUnion, observed);
  const unionArea = areaKm2(forecastUnion);
  const unionFalseAlarm = Math.max(0, unionArea - unionHit);
  const unionMiss = Math.max(0, observedArea - unionHit);
  const unionDenom = unionHit + unionFalseAlarm + unionMiss;
  const unionCsi = unionDenom > 0 ? unionHit / unionDenom : 0;

  const score = perTierCsi.length > 0
    ? perTierCsi.reduce((sum, value) => sum + value, 0) / perTierCsi.length
    : unionCsi;

  return scoredComponent(
    'spatialContingency',
    score,
    `CSI ${roundTo(unionCsi)} over ${roundTo(unionArea)} km² forecast vs ${roundTo(
      observedArea
    )} km² observed across ${tiers.length || 1} tier(s).`,
    {
      csi: roundTo(unionCsi),
      hitAreaKm2: roundTo(unionHit),
      falseAlarmAreaKm2: roundTo(unionFalseAlarm),
      missAreaKm2: roundTo(unionMiss),
      tiers: tiers.length,
    }
  );
};

/**
 * False-alarm discipline: probability-weighted areal FAR from the grid. Empty
 * high-probability paint is penalized more heavily than an empty 2% skirt.
 */
export const scoreFalseAlarmDiscipline = (evaluation: GridEvaluation): ComponentScore => {
  const { forecast, observed, cellCount } = evaluation;

  let weightedHit = 0;
  let weightedFalseAlarm = 0;
  for (let index = 0; index < cellCount; index += 1) {
    const f = forecast[index];
    if (f <= 0) {
      continue;
    }
    if (observed[index] === 1) {
      weightedHit += f;
    } else {
      weightedFalseAlarm += f;
    }
  }

  const weightedForecast = weightedHit + weightedFalseAlarm;
  if (weightedForecast === 0) {
    return notEvaluatedComponent('farDiscipline', 'No forecast probability paint to evaluate.');
  }

  const far = weightedFalseAlarm / weightedForecast;
  return scoredComponent(
    'farDiscipline',
    1 - far,
    `Probability-weighted FAR ${roundTo(far)} (${roundTo(weightedFalseAlarm)} of ${roundTo(
      weightedForecast
    )} weighted paint unverified).`,
    { far: roundTo(far), weightedHit: roundTo(weightedHit), weightedFalseAlarm: roundTo(weightedFalseAlarm) }
  );
};

export type { AreaPolygon };
