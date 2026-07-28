import type { OutlookData } from '../../types/outlooks';
import type { StormReport } from '../../types/stormReports';
import {
  assessDataQuality,
  buildPackageGrade,
  gradeProduct,
  rollUpPackageGrade,
} from './composite';
import { FORECAST_GRADE_FORMULA_VERSION } from './formulaVersion';
import {
  PRODUCT_KINDS,
  scoreToLetter,
  type PackageGrade,
  type ProductGrade,
} from './gradeContract';
import { extractProductContours, reportsForProduct } from './neighborhood';

/**
 * Top-level Forecast Grade orchestrator (PR 04 — yield-composite).
 *
 * Wraps the composite rollup with input validation and a staged, foreground
 * progress runner. Accuracy is prioritized over a fixed latency budget; long runs
 * simply report staged progress and complete automatically.
 */

export interface GradeForecastInput {
  outlooks: OutlookData;
  reports: StormReport[];
  /** True when the SPC report fetch failed (forces a Blocked result). */
  reportsError?: boolean;
  /** Overrides the snapshot timestamp (tests). */
  generatedAt?: string;
}

export interface GradeInputValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Validates run inputs. Invalid inputs (no outlook object, non-array reports, or
 * a failed required report fetch) block the run rather than producing a grade.
 */
export const validateGradeInputs = (input: Partial<GradeForecastInput>): GradeInputValidation => {
  if (!input.outlooks || typeof input.outlooks !== 'object') {
    return { valid: false, reason: 'Load a forecast package before grading.' };
  }
  if (!Array.isArray(input.reports)) {
    return { valid: false, reason: 'Storm reports are unavailable for this run.' };
  }
  if (input.reportsError) {
    return { valid: false, reason: 'Storm reports could not be loaded for this date.' };
  }
  const hasGeometry = PRODUCT_KINDS.some(
    (product) => extractProductContours(input.outlooks as OutlookData, product).length > 0
  );
  if (!hasGeometry) {
    return {
      valid: false,
      reason: 'The forecast package has no severe hazard geometry to grade.',
    };
  }
  return { valid: true };
};

/** Synchronously computes the full package grade. */
export const gradeForecast = ({
  outlooks,
  reports,
  reportsError = false,
  generatedAt,
}: GradeForecastInput): PackageGrade =>
  buildPackageGrade({
    formulaVersion: FORECAST_GRADE_FORMULA_VERSION,
    outlooks,
    reports,
    reportsError,
    generatedAt,
  });

export interface GradeProgress {
  /** 0–1 completion fraction. */
  fraction: number;
  /** Human-readable stage label for the foreground progress UI. */
  label: string;
}

export type GradeProgressHandler = (progress: GradeProgress) => void;

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Counts reports relevant to the products that actually have geometry, so
 * unrelated hazard reports can't mask a sparse product in the staged runner
 * either. Mirrors `buildPackageGrade` so `runForecastGrade` produces the
 * same data-quality assessment without re-deriving it.
 */
const relevantReportCount = (outlooks: OutlookData, reports: StormReport[]): number => {
  const counts = PRODUCT_KINDS
    .filter((product) => extractProductContours(outlooks, product).length > 0)
    .map((product) => reportsForProduct(reports, product).length);
  return counts.length === 0 ? 0 : Math.max(...counts);
};

/**
 * Runs the grade product-by-product, reporting staged foreground progress and
 * yielding between products so the UI can paint. Reuses the already-computed
 * `products` array for the package rollup instead of recomputing every product
 * synchronously after the staged loop.
 */
export const runForecastGrade = async (
  input: GradeForecastInput,
  onProgress?: GradeProgressHandler
): Promise<PackageGrade> => {
  const { outlooks, reports, reportsError = false, generatedAt } = input;

  onProgress?.({ fraction: 0.02, label: 'Preparing package and reports…' });
  await nextFrame();

  const products: ProductGrade[] = [];
  for (let index = 0; index < PRODUCT_KINDS.length; index += 1) {
    const product = PRODUCT_KINDS[index];
    onProgress?.({
      fraction: 0.05 + (index / PRODUCT_KINDS.length) * 0.85,
      label: `Grading ${product} product…`,
    });
    products.push(gradeProduct(product, outlooks, reports));
    await nextFrame();
  }

  onProgress?.({ fraction: 0.95, label: 'Rolling up package grade…' });
  await nextFrame();

  const hasGeometry = PRODUCT_KINDS.some(
    (product) => extractProductContours(outlooks, product).length > 0
  );
  const relevantCount = relevantReportCount(outlooks, reports);
  const quality = assessDataQuality(hasGeometry, relevantCount, reportsError);
  const rolledGrade = quality.withholdPackageGrade ? null : rollUpPackageGrade(products);
  const snapshot: PackageGrade = {
    formulaVersion: FORECAST_GRADE_FORMULA_VERSION,
    grade: rolledGrade,
    letter: scoreToLetter(rolledGrade),
    products,
    dataQuality: quality.quality,
    dataQualityReason: quality.reason,
    hasReports: relevantCount > 0,
    generatedAt: generatedAt ?? new Date().toISOString(),
  };

  onProgress?.({ fraction: 1, label: 'Complete' });
  return snapshot;
};
