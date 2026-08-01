import { FORECAST_GRADE_FORMULA_VERSION } from './formulaVersion';

/**
 * Forecast Grade contract (PR 01 — formula-contract).
 *
 * Pure types and scalar helpers shared by every stage of the versioned engine.
 * No geometry or report parsing lives here so the contract can be imported by
 * UI, tests, and history persistence without pulling in turf.
 */

/** Severe hazards with their own probabilistic contours and sig thresholds. */
export type HazardKind = 'tornado' | 'wind' | 'hail';

export const HAZARD_KINDS: readonly HazardKind[] = ['tornado', 'wind', 'hail'] as const;

/**
 * Severe hazard products graded and rolled up into the package. Categorical and
 * TSTM are composite/sub-severe display layers only — they are not scored.
 */
export type ProductKind = HazardKind;

export const PRODUCT_KINDS: readonly ProductKind[] = HAZARD_KINDS;

export const PRODUCT_LABELS: Record<ProductKind, string> = {
  tornado: 'Tornado',
  wind: 'Wind',
  hail: 'Hail',
};

/** Map display layers include the composite categorical outlook (not graded). */
export type MapOutlookLayer = 'categorical' | HazardKind;

export const MAP_OUTLOOK_LAYERS: readonly MapOutlookLayer[] = [
  'categorical',
  'tornado',
  'wind',
  'hail',
] as const;

/** Primary components of a single-product Forecast Grade plus technical diagnostics. */
export type ComponentKey =
  | 'eventCapture'
  | 'tierPlacement'
  | 'eventYield'
  | 'severity'
  | 'probabilitySkill'
  | 'spatialContingency'
  | 'farDiscipline';

export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Data quality is a descriptive gate, never a hidden weight on the score.
 * - Good: enough geometry and reports to trust every applicable component.
 * - Limited: gradable, but sparse reports or few applicable components.
 * - Blocked: geometry gate failed or reports could not be loaded — no grade.
 */
export type DataQuality = 'Good' | 'Limited' | 'Blocked';

/** Headline Forecast Grade weights (percent). Renormalized over applicable components. */
export const COMPONENT_WEIGHTS: Record<ComponentKey, number> = {
  eventCapture: 35,
  tierPlacement: 30,
  eventYield: 20,
  severity: 15,
  probabilitySkill: 0,
  spatialContingency: 0,
  farDiscipline: 0,
};

/** Human-readable component labels used by the dashboard and exports. */
export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  eventCapture: 'Event capture',
  tierPlacement: 'Tier-aware placement',
  eventYield: 'Tier-aware event yield',
  severity: 'Significant-threat placement',
  probabilitySkill: 'Probability skill',
  spatialContingency: 'Spatial contingency',
  farDiscipline: 'False-alarm discipline',
};

export const COMPONENT_ORDER: readonly ComponentKey[] = [
  'eventCapture',
  'tierPlacement',
  'eventYield',
  'severity',
] as const;

/** Technical diagnostics retained for transparency but excluded from the headline grade. */
export const DIAGNOSTIC_ORDER: readonly ComponentKey[] = [
  'probabilitySkill',
  'spatialContingency',
  'farDiscipline',
] as const;

interface ComponentScoreBase {
  key: ComponentKey;
  label: string;
  /** Nominal composite weight (percent) before renormalization. */
  weight: number;
  /** Short factual metrics sentence — never coaching prose. */
  detail: string;
  /** Raw metrics for the breakdown drawer and share/export payloads. */
  metrics?: Record<string, number>;
}

/** One scored (or N/A) composite component for a single hazard product. */
export type ComponentScore = ComponentScoreBase &
  (
    | { applicable: true; score: number }
    | { applicable: false; score: null }
  );

/** Grade for a single severe hazard product (tornado, wind, or hail). */
export interface ProductGrade {
  product: ProductKind;
  label: string;
  /** 0–100 with one decimal, or null when the product is Not evaluated. */
  grade: number | null;
  letter: LetterGrade | null;
  components: ComponentScore[];
  /** Technical diagnostics shown separately; these do not contribute to grade. */
  diagnostics?: ComponentScore[];
  /** False when nothing was forecast and nothing observed for this product. */
  applicable: boolean;
  reportCount: number;
}

/** Package grade across every present hazard product. */
export interface PackageGrade {
  formulaVersion: typeof FORECAST_GRADE_FORMULA_VERSION;
  /** Equal-weight mean of present product grades; null when withheld or not evaluated. */
  grade: number | null;
  letter: LetterGrade | null;
  products: ProductGrade[];
  dataQuality: DataQuality;
  dataQualityReason: string;
  /** True when at least one storm report was supplied. */
  hasReports: boolean;
  generatedAt: string;
}

export {
  clamp,
  composeComponents,
  notEvaluatedComponent,
  roundGrade,
  scoreToLetter,
  scoredComponent,
} from './gradeScoring';

export { FORECAST_GRADE_FORMULA_VERSION };
