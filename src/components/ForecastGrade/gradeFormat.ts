import type { LetterGrade } from '../../utils/verificationV2';

/** Formats a 0–100 grade to one decimal, or an em dash when withheld. */
export const formatGrade = (grade: number | null): string =>
  grade === null || Number.isNaN(grade) ? '—' : grade.toFixed(1);

/** Formats a 0–1 component score as a whole-number percentage. */
export const formatScore = (score: number | null): string =>
  score === null || Number.isNaN(score) ? 'N/A' : `${Math.round(score * 100)}`;

/** Tailwind text color class for a letter grade. */
export const letterColorClass = (letter: LetterGrade | null): string => {
  switch (letter) {
    case 'A':
      return 'text-emerald-500';
    case 'B':
      return 'text-lime-500';
    case 'C':
      return 'text-yellow-500';
    case 'D':
      return 'text-orange-500';
    case 'F':
      return 'text-red-500';
    default:
      return 'text-slate-400';
  }
};

/** Background badge class for a data-quality status. */
export const dataQualityClass = (quality: string): string => {
  switch (quality) {
    case 'Good':
      return 'bg-emerald-500/15 text-emerald-600';
    case 'Limited':
      return 'bg-amber-500/15 text-amber-600';
    case 'Blocked':
      return 'bg-red-500/15 text-red-600';
    default:
      return 'bg-slate-500/15 text-slate-500';
  }
};
