import type { GFCForecastSaveData } from './outlooks';
import type {
  DataQuality,
  LetterGrade,
  PackageGrade,
  ProductKind,
} from '../utils/verificationV2/gradeContract';

/**
 * Persistence + source types for the Forecast Grade dashboard (PR 05).
 *
 * Grade cards are the lightweight, trend-only history synced for signed-in users.
 * Snapshots are the immutable full records (premium) that can restore a package.
 */

/** Account capability tier that drives available sources and history depth. */
export type GradeAccountTier = 'signed-out' | 'free' | 'premium';

/** Where the forecast package for a run came from. Reports are always SPC. */
export type PackageSourceKind = 'file' | 'cloud';

/** A lightweight, trend-only history entry. Does not restore a full package. */
export interface GradeCard {
  id: string;
  createdAt: string;
  /** SPC report date (yyyy-mm-dd) or null for a today/live run. */
  reportDate: string | null;
  formulaVersion: string;
  grade: number | null;
  letter: LetterGrade | null;
  dataQuality: DataQuality;
  /** Per-product grades for hazard-filterable trend charts. */
  productGrades: Partial<Record<ProductKind, number | null>>;
  sourceLabel: string;
  /** True only when an immutable full snapshot was stored (premium). */
  hasSnapshot: boolean;
}

/** Immutable full record persisted for premium accounts to enable restore. */
export interface GradeSnapshot {
  card: GradeCard;
  package: PackageGrade;
  /** Serialized forecast package captured at run time (formula-version stamped). */
  forecast: GFCForecastSaveData;
  reportDate: string | null;
}
