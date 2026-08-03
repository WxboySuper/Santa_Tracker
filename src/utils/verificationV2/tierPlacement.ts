import type { StormReport } from '../../types/stormReports';
import {
  notEvaluatedComponent,
  scoredComponent,
  type ComponentScore,
  type ProductKind,
} from './gradeContract';
import {
  reportsForProduct,
  reportsNearRegion,
  unionAll,
  type ProductContour,
} from './neighborhood';
import { scoreSpatialContingency } from './spatialContingency';

/** Probability at which a forecast begins making a spatially specific core claim. */
export const CORE_PLACEMENT_THRESHOLD = 0.15;

/**
 * Scores spatial specificity without treating a broad low-probability envelope
 * as a conventional false alarm. At 15%+, area CSI matters; below 15%, the
 * component gives bounded credit for broad coverage and leaves event capture to
 * the separate capture component.
 */
export const scoreTierPlacement = (
  product: ProductKind,
  contours: ProductContour[],
  reports: StormReport[]
): ComponentScore => {
  const relevantReports = reportsForProduct(reports, product);
  const paintable = contours.filter((contour) => contour.probability > 0);
  const coreContours = paintable.filter(
    (contour) => contour.probability >= CORE_PLACEMENT_THRESHOLD
  );

  if (coreContours.length > 0) {
    const raw = scoreSpatialContingency(coreContours, relevantReports);
    if (!raw.applicable || raw.score === null) {
      return notEvaluatedComponent('tierPlacement', 'Core placement could not be evaluated.');
    }

    // CSI is intentionally softened here: it should identify a misplaced core
    // without recreating the old failing-grade area penalty.
    const score = Math.sqrt(raw.score);
    return scoredComponent(
      'tierPlacement',
      score,
      `15%+ core placement ${Math.round(score * 100)}% after softened area contingency (${raw.detail}).`,
      {
        rawCoreCsi: raw.score,
        placementScore: score,
        coreTiers: new Set(coreContours.map((contour) => contour.probability)).size,
        ...(raw.metrics ?? {}),
      }
    );
  }

  const lowRiskUnion = unionAll(paintable.map((contour) => contour.polygon));
  if (!lowRiskUnion || relevantReports.length === 0) {
    return notEvaluatedComponent(
      'tierPlacement',
      relevantReports.length === 0
        ? 'No relevant storm reports for low-probability placement.'
        : 'No non-zero-probability area to evaluate.'
    );
  }

  const captured = reportsNearRegion(lowRiskUnion, relevantReports);
  const coverage = captured / relevantReports.length;
  const score = 0.35 + coverage * 0.3;
  return scoredComponent(
    'tierPlacement',
    score,
    `No 15%+ core; broad low-probability coverage captured ${captured} of ${relevantReports.length} relevant reports.`,
    {
      captured,
      total: relevantReports.length,
      lowRiskCoverage: coverage,
      placementScore: score,
    }
  );
};
