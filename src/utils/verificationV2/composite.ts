import type { OutlookData } from '../../types/outlooks';
import type { StormReport } from '../../types/stormReports';
import { LIMITED_REPORT_CEILING } from './constants';
import {
  COMPONENT_ORDER,
  PRODUCT_KINDS,
  PRODUCT_LABELS,
  composeComponents,
  notEvaluatedComponent,
  roundGrade,
  scoreToLetter,
  type ComponentScore,
  type DataQuality,
  type PackageGrade,
  type ProductGrade,
  type ProductKind,
} from './gradeContract';
import {
  buildVerificationGrid,
  extractProductContours,
  observedFootprint,
  reportsForProduct,
  unionAll,
} from './neighborhood';
import {
  evaluateGrid,
  scoreFalseAlarmDiscipline,
  scoreProbabilitySkill,
  scoreSpatialContingency,
} from './probSpatial';
import { FORECAST_GRADE_FORMULA_VERSION } from './formulaVersion';
import { scoreEventYield, scoreSeverity } from './yieldSeverity';

/**
 * Composite rollup for the gfc-ver-1 engine (PR 04 — yield-composite).
 *
 * Combines the five components into a product grade (renormalizing N/A out),
 * rolls present products into an equal-weight package grade, and derives the
 * Good / Limited / Blocked data-quality gate.
 */

const orderedComponents = (components: ComponentScore[]): ComponentScore[] => {
  const byKey = new Map(components.map((component) => [component.key, component]));
  return COMPONENT_ORDER.map(
    (key) => byKey.get(key) ?? notEvaluatedComponent(key, 'Component not evaluated.')
  );
};

/** Grades a single product, returning a Not-evaluated shell when nothing exists. */
export const gradeProduct = (
  product: ProductKind,
  outlooks: OutlookData,
  reports: StormReport[]
): ProductGrade => {
  const contours = extractProductContours(outlooks, product);
  const productReports = reportsForProduct(reports, product);
  const hasForecast = contours.length > 0;

  if (!hasForecast) {
    const reason = productReports.length === 0
      ? 'Product not present in this package.'
      : 'No forecast issued for this product; reports cannot be evaluated.';
    return {
      product,
      label: PRODUCT_LABELS[product],
      grade: null,
      letter: null,
      applicable: false,
      reportCount: productReports.length,
      components: COMPONENT_ORDER.map((key) => notEvaluatedComponent(key, reason)),
    };
  }

  const forecastUnion = unionAll(contours.map((contour) => contour.polygon));
  const observed = observedFootprint(productReports);
  const grid = buildVerificationGrid(forecastUnion, observed);
  const evaluation = evaluateGrid(grid, contours, productReports);

  const components = orderedComponents([
    scoreProbabilitySkill(evaluation),
    scoreSpatialContingency(contours, productReports),
    scoreFalseAlarmDiscipline(evaluation),
    scoreEventYield(product, contours, reports),
    scoreSeverity(product, contours, productReports),
  ]);

  const grade = composeComponents(components);

  return {
    product,
    label: PRODUCT_LABELS[product],
    grade,
    letter: scoreToLetter(grade),
    applicable: components.some((component) => component.applicable),
    reportCount: productReports.length,
    components,
  };
};

/** Equal-weight mean of present product grades, rounded to one decimal. */
export const rollUpPackageGrade = (products: ProductGrade[]): number | null => {
  const graded = products.filter(
    (product): product is ProductGrade & { grade: number } =>
      product.applicable && product.grade !== null
  );
  if (graded.length === 0) {
    return null;
  }
  const mean = graded.reduce((sum, product) => sum + product.grade, 0) / graded.length;
  return roundGrade(mean);
};

export interface DataQualityAssessment {
  quality: DataQuality;
  reason: string;
  /** When true, callers withhold the package grade even if products graded. */
  withholdPackageGrade: boolean;
}

/**
 * Derives the data-quality gate. Geometry is a gate, not a weight: a package with
 * no forecast geometry (or unreadable reports) is Blocked; a sparse non-quiet run
 * is Limited with the package grade withheld; a clean quiet day is Good.
 */
export const assessDataQuality = (
  hasGeometry: boolean,
  reportCount: number,
  reportsError: boolean
): DataQualityAssessment => {
  if (reportsError) {
    return { quality: 'Blocked', reason: 'Storm reports could not be loaded.', withholdPackageGrade: true };
  }
  if (!hasGeometry) {
    return { quality: 'Blocked', reason: 'No severe hazard geometry to grade.', withholdPackageGrade: true };
  }
  if (reportCount === 0) {
    return { quality: 'Good', reason: 'No reports', withholdPackageGrade: false };
  }
  if (reportCount <= LIMITED_REPORT_CEILING) {
    return {
      quality: 'Limited',
      reason: `Only ${reportCount} relevant report${reportCount === 1 ? '' : 's'}; package grade withheld.`,
      withholdPackageGrade: true,
    };
  }
  return { quality: 'Good', reason: 'Forecast and reports available.', withholdPackageGrade: false };
};

export interface BuildPackageOptions {
  formulaVersion: typeof FORECAST_GRADE_FORMULA_VERSION;
  outlooks: OutlookData;
  reports: StormReport[];
  reportsError?: boolean;
  generatedAt?: string;
}

/**
 * Counts reports relevant to the products that actually have geometry, so
 * unrelated hazard reports can't mask a sparse product. Returns 0 if no
 * forecast was issued for any hazard product.
 */
const relevantReportCount = (outlooks: OutlookData, reports: StormReport[]): number => {
  const counts = PRODUCT_KINDS
    .filter((product) => extractProductContours(outlooks, product).length > 0)
    .map((product) => reportsForProduct(reports, product).length);
  return counts.length === 0 ? 0 : Math.max(...counts);
};

/** Builds the full package grade across every product with the quality gate applied. */
export const buildPackageGrade = ({
  formulaVersion,
  outlooks,
  reports,
  reportsError = false,
  generatedAt,
}: BuildPackageOptions): PackageGrade => {
  const products = PRODUCT_KINDS.map((product) => gradeProduct(product, outlooks, reports));
  const hasGeometry = PRODUCT_KINDS.some(
    (product) => extractProductContours(outlooks, product).length > 0
  );

  const relevantCount = relevantReportCount(outlooks, reports);
  const quality = assessDataQuality(hasGeometry, relevantCount, reportsError);
  const rolledGrade = rollUpPackageGrade(products);
  const grade = quality.withholdPackageGrade ? null : rolledGrade;

  return {
    formulaVersion,
    grade,
    letter: scoreToLetter(grade),
    products,
    dataQuality: quality.quality,
    dataQualityReason: quality.reason,
    hasReports: relevantCount > 0,
    generatedAt: generatedAt ?? new Date().toISOString(),
  };
};
