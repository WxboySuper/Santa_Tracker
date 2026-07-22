import type { ForecastCycle } from '../../types/outlooks';
import type { StormReport } from '../../types/stormReports';
import type {
  GradeAccountTier,
  GradeCard,
  PackageSourceKind,
} from '../../types/forecastGrade';
import {
  deserializeForecast,
  readForecastImportFile,
  validateForecastData,
} from '../fileUtils';
import { fetchStormReports, fetchTodayStormReports } from '../stormReportParser';
import type { PackageGrade, ProductKind } from './gradeContract';

/**
 * Source adapters for the Forecast Grade dashboard (PR 05 — sources-history).
 *
 * Source selection is always explicit — there is no automatic handoff from the
 * Forecast Editor. File + SPC reports are available to everyone; premium adds a
 * cloud-package source. Adapters validate inputs and surface a blocking error
 * rather than silently grading malformed data.
 */

/** Resolves the account capability tier from auth + entitlement state. */
export const resolveAccountTier = (
  isSignedIn: boolean,
  premiumActive: boolean
): GradeAccountTier => {
  if (!isSignedIn) {
    return 'signed-out';
  }
  return premiumActive ? 'premium' : 'free';
};

/** Package sources available to a tier. Reports are always SPC for every tier. */
export const availablePackageSources = (tier: GradeAccountTier): PackageSourceKind[] =>
  tier === 'premium' ? ['file', 'cloud'] : ['file'];

/** True when the tier keeps synced grade-card history. */
export const tierHasHistory = (tier: GradeAccountTier): boolean => tier !== 'signed-out';

/** True when the tier stores restorable full snapshots. */
export const tierHasSnapshots = (tier: GradeAccountTier): boolean => tier === 'premium';

export class SourceLoadError extends Error {}

/** Loads and validates a forecast package from an uploaded file, or blocks. */
export const loadForecastFromFile = async (file: File): Promise<ForecastCycle> => {
  let raw: unknown;
  try {
    raw = await readForecastImportFile(file);
  } catch {
    throw new SourceLoadError('That file could not be read. Choose a valid GFC forecast JSON.');
  }

  if (!validateForecastData(raw)) {
    throw new SourceLoadError('That file is not a valid GFC forecast package.');
  }

  try {
    return deserializeForecast(raw);
  } catch {
    throw new SourceLoadError('That forecast package could not be parsed.');
  }
};

/**
 * Converts an ISO `YYYY-MM-DD` date (from a native date input) into the SPC
 * archive `YYMMDD` format. Values already in `YYMMDD` are returned unchanged.
 */
const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const toArchiveDate = (reportDate: string): string | null => {
  const iso = reportDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (!isValidCalendarDate(year, month, day)) {
      return null;
    }
    return `${iso[1].slice(2)}${iso[2]}${iso[3]}`;
  }

  const archive = reportDate.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (archive) {
    const year = 2000 + Number(archive[1]);
    const month = Number(archive[2]);
    const day = Number(archive[3]);
    if (!isValidCalendarDate(year, month, day)) {
      return null;
    }
    return reportDate;
  }

  return null;
};

/** Loads SPC storm reports for a date (or today when null), or blocks. */
export const loadReportsForDate = async (reportDate: string | null): Promise<StormReport[]> => {
  try {
    if (reportDate) {
      const archiveDate = toArchiveDate(reportDate);
      if (!archiveDate) {
        throw new SourceLoadError('Choose a valid report date.');
      }
      return await fetchStormReports(archiveDate);
    }
    return await fetchTodayStormReports();
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    throw new SourceLoadError(`Storm reports could not be loaded (${detail}).`);
  }
};

const newId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the timestamp id below.
  }
  return `grade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export interface BuildGradeCardOptions {
  reportDate: string | null;
  sourceLabel: string;
  hasSnapshot: boolean;
}

/** Distills a full package grade into a trend-only history card. */
export const buildGradeCard = (
  pkg: PackageGrade,
  { reportDate, sourceLabel, hasSnapshot }: BuildGradeCardOptions
): GradeCard => {
  const productGrades: Partial<Record<ProductKind, number | null>> = {};
  for (const product of pkg.products) {
    productGrades[product.product] = product.applicable ? product.grade : null;
  }

  return {
    id: newId(),
    createdAt: pkg.generatedAt,
    reportDate,
    formulaVersion: pkg.formulaVersion,
    grade: pkg.grade,
    letter: pkg.letter,
    dataQuality: pkg.dataQuality,
    productGrades,
    sourceLabel,
    hasSnapshot,
  };
};
