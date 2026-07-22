import type { StormReport } from '../../types/stormReports';
import {
  SEVERITY_SIG_DRAWN_NONE_OBSERVED,
  SEVERITY_SIG_HIT,
  SEVERITY_SIG_MISSED,
  SEVERITY_SIG_OUT_OF_AREA,
  YIELD_BASELINE_EXPECTED,
  YIELD_CORE_THRESHOLDS,
  YIELD_DENSITY_PER_10K_KM2,
  YIELD_EPSILON,
  type YieldCoreThreshold,
} from './constants';
import {
  notEvaluatedComponent,
  scoredComponent,
  type ComponentScore,
  type ProductKind,
} from './gradeContract';
import {
  areaKm2,
  isSignificantReport,
  reportsNearRegion,
  unionAll,
  type ProductContour,
} from './neighborhood';

/**
 * Event-yield and severity components (PR 04 — yield-composite).
 *
 * These are the GFC "intent" layer on top of the SPC occurrence math: yield asks
 * whether the number of reports matches what a high-probability core claimed,
 * and severity checks significant contours against significant reports.
 */

const roundTo = (value: number, digits = 3): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * Event yield / concentration. For each drawn core (f ≥ 0.15 / 0.30 / 0.45) the
 * expected report count is `baseline + area × density(f)`, and yield is
 * `min(1, observed / max(expected, ε))`. Present cores are averaged. This makes a
 * huge 30% + 1 report fail on yield while softening a tiny 45% + 1 report.
 */
export const scoreEventYield = (
  contours: ProductContour[],
  reports: StormReport[]
): ComponentScore => {
  const coreYields: number[] = [];
  const metrics: Record<string, number> = {};
  const details: string[] = [];

  for (const threshold of YIELD_CORE_THRESHOLDS) {
    const coreUnion = unionAll(
      contours.filter((contour) => contour.probability >= threshold).map((contour) => contour.polygon)
    );
    const coreArea = areaKm2(coreUnion);
    if (coreArea <= 0) {
      continue;
    }

    const density = YIELD_DENSITY_PER_10K_KM2[threshold as YieldCoreThreshold];
    const baseline = YIELD_BASELINE_EXPECTED[threshold as YieldCoreThreshold];
    const expected = baseline + (coreArea / 10_000) * density;
    const observed = reportsNearRegion(coreUnion, reports);
    const yieldValue = Math.min(1, observed / Math.max(expected, YIELD_EPSILON));

    coreYields.push(yieldValue);
    const label = `${Math.round(threshold * 100)}`;
    metrics[`core${label}Expected`] = roundTo(expected, 2);
    metrics[`core${label}Observed`] = observed;
    metrics[`core${label}Yield`] = roundTo(yieldValue);
    details.push(`${label}%: ${observed}/${roundTo(expected, 1)} exp → ${roundTo(yieldValue, 2)}`);
  }

  if (coreYields.length === 0) {
    return notEvaluatedComponent('eventYield', 'No probability core at or above 15% was drawn.');
  }

  const score = coreYields.reduce((sum, value) => sum + value, 0) / coreYields.length;
  return scoredComponent('eventYield', score, `Core yield ${details.join('; ')}.`, metrics);
};

/**
 * Severity. Compares significant contours to significant reports within the
 * 25-mile neighborhood. Not evaluated when neither a sig contour nor a sig report
 * exists; a soft ~70 penalty applies when sig is drawn but nothing sig verifies.
 */
export const scoreSeverity = (
  product: ProductKind,
  contours: ProductContour[],
  reports: StormReport[]
): ComponentScore => {
  if (product === 'categorical') {
    return notEvaluatedComponent('severity', 'Significant contours are hazard-specific; not scored for categorical.');
  }

  const sigContours = contours.filter((contour) => contour.isSignificant);
  const sigDrawn = sigContours.length > 0;
  const sigReports = reports.filter(isSignificantReport);
  const sigObserved = sigReports.length > 0;

  if (!sigDrawn && !sigObserved) {
    return notEvaluatedComponent('severity', 'No significant contour drawn and no significant report observed.');
  }

  const sigUnion = unionAll(sigContours.map((contour) => contour.polygon));

  if (sigDrawn && sigObserved) {
    const inArea = reportsNearRegion(sigUnion, sigReports);
    if (inArea > 0) {
      return scoredComponent(
        'severity',
        SEVERITY_SIG_HIT,
        `${inArea} significant report(s) within the significant contour.`,
        { sigReports: sigReports.length, sigInArea: inArea }
      );
    }
    return scoredComponent(
      'severity',
      SEVERITY_SIG_OUT_OF_AREA,
      `${sigReports.length} significant report(s), none inside the significant contour.`,
      { sigReports: sigReports.length, sigInArea: 0 }
    );
  }

  if (sigDrawn && !sigObserved) {
    return scoredComponent(
      'severity',
      SEVERITY_SIG_DRAWN_NONE_OBSERVED,
      'Significant contour drawn; no significant report observed (soft penalty).',
      { sigReports: 0, sigInArea: 0 }
    );
  }

  return scoredComponent(
    'severity',
    SEVERITY_SIG_MISSED,
    `${sigReports.length} significant report(s) with no significant contour drawn.`,
    { sigReports: sigReports.length, sigInArea: 0 }
  );
};
