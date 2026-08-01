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

/**
 * Event capture is the primary single-run outcome measure. A matching report
 * is captured when it falls within the SPC 25-mile neighborhood of any
 * non-zero-probability forecast contour. Forecast extent is not treated as a
 * false alarm here; higher-risk overforecasting is handled by event yield.
 */
export const scoreEventCapture = (
  product: ProductKind,
  contours: ProductContour[],
  reports: StormReport[]
): ComponentScore => {
  const relevantReports = reportsForProduct(reports, product);
  if (relevantReports.length === 0) {
    return notEvaluatedComponent('eventCapture', 'No relevant storm reports to capture.');
  }

  const forecastUnion = unionAll(
    contours.filter((contour) => contour.probability > 0).map((contour) => contour.polygon)
  );
  if (!forecastUnion) {
    return notEvaluatedComponent('eventCapture', 'No non-zero-probability forecast area to evaluate.');
  }

  const captured = reportsNearRegion(forecastUnion, relevantReports);
  const total = relevantReports.length;
  const score = captured / total;

  return scoredComponent(
    'eventCapture',
    score,
    `Captured ${captured} of ${total} relevant report${total === 1 ? '' : 's'} within the 25-mile forecast neighborhood.`,
    { captured, missed: total - captured, total }
  );
};
