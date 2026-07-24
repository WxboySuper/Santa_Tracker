import type { HazardKind } from './gradeContract';

/**
 * Versioned tuning tables for the gfc-ver-1 Forecast Grade (PR 01/02).
 *
 * Every magic number the engine relies on lives here so official grades change
 * only via GFC releases (no per-user sliders) and so the calibration can be
 * audited against the methodology docs. Changing any value here is a formula
 * change and requires a formula-version bump.
 */

/** SPC neighborhood radius: severe within 25 miles of any point in the contour. */
export const SPC_NEIGHBORHOOD_MILES = 25;

/** 25 miles expressed in kilometers (~40 km) for buffer/grid math. */
export const SPC_NEIGHBORHOOD_KM = 40.2336;

/** Target verification grid spacing (~10 km) over the forecast + buffer envelope. */
export const GRID_SPACING_KM = 10;

/** Hard ceiling on grid cells; spacing coarsens past this to keep runs bounded. */
export const MAX_GRID_CELLS = 16000;

/** Probability core thresholds (fractions) used by the event-yield component. */
export const YIELD_CORE_THRESHOLDS = [0.15, 0.3, 0.45] as const;

export type YieldCoreThreshold = (typeof YIELD_CORE_THRESHOLDS)[number];

/**
 * Expected report density per 10,000 km² for each core threshold. Higher `f`
 * implies a more concentrated, higher-yield claim, so density rises with the
 * threshold. Combined with the baseline below, this prevents a huge 30%+1 report
 * "ace" and softens a tiny 45%+1 report "full verify".
 */
export const YIELD_DENSITY_PER_10K_KM2: Record<YieldCoreThreshold, number> = {
  0.15: 1.5,
  0.3: 3,
  0.45: 5,
};

/**
 * Minimum expected reports for a drawn core regardless of area. Guarantees that
 * a very small high-probability core still expects concentrated activity, so a
 * lone report cannot fully verify it.
 */
export const YIELD_BASELINE_EXPECTED: Record<YieldCoreThreshold, number> = {
  0.15: 0.5,
  0.3: 1,
  0.45: 2,
};

/** Floor on expected reports to avoid divide-by-zero in the yield ratio. */
export const YIELD_EPSILON = 0.25;

/** Soft severity score when a significant contour is drawn but no sig report occurs. */
export const SEVERITY_SIG_DRAWN_NONE_OBSERVED = 0.7;

/** Severity score when a sig report occurs inside a drawn sig neighborhood. */
export const SEVERITY_SIG_HIT = 1;

/** Severity score when a sig report occurs but outside the drawn sig neighborhood. */
export const SEVERITY_SIG_OUT_OF_AREA = 0.5;

/** Severity score when a sig report occurs and no sig contour was drawn. */
export const SEVERITY_SIG_MISSED = 0.4;

/**
 * Significant-severity magnitude thresholds (SPC convention):
 * tornado EF2+, wind ≥ 65 kt (75 mph), hail ≥ 2.00 in.
 */
export const SIGNIFICANT_THRESHOLD: Record<HazardKind, number> = {
  tornado: 2,
  wind: 75,
  hail: 2,
};

/** Report count at/under which a non-quiet run is downgraded to Limited. */
export const LIMITED_REPORT_CEILING = 2;
