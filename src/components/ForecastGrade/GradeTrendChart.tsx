import React, { useMemo, useState } from 'react';
import type { GradeCard } from '../../types/forecastGrade';
import { PRODUCT_KINDS, PRODUCT_LABELS, type ProductKind } from '../../utils/verificationV2';
import GradeTrendHistory from './GradeTrendHistory';
import GradeTrendSvg from './GradeTrendSvg';
import ForecastGradeSelect from './ForecastGradeSelect';

interface GradeTrendChartProps {
  cards: GradeCard[];
  onSelectCard?: (card: GradeCard) => void;
}

type TrendFilter = 'package' | ProductKind;

const MAX_TREND_CARDS = 25;

const valueForFilter = (card: GradeCard, filter: TrendFilter): number | null => {
  const raw = filter === 'package' ? card.grade : card.productGrades[filter] ?? null;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
};

export const dedupeGradeCardsByDay = (cards: GradeCard[]): GradeCard[] => {
  const latestByDay = new Map<string, GradeCard>();
  cards.forEach((card) => {
    const day = card.reportDate ?? 'today';
    const current = latestByDay.get(day);
    if (!current || new Date(card.createdAt).getTime() >= new Date(current.createdAt).getTime()) {
      latestByDay.set(day, card);
    }
  });
  return [...latestByDay.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

/**
 * Grade trend for the latest 25 cards, filterable by hazard. Cards are
 * trend-only; selecting one does not reopen a full package for free accounts.
 */
const GradeTrendChart: React.FC<GradeTrendChartProps> = ({ cards, onSelectCard }) => {
  const [filter, setFilter] = useState<TrendFilter>('package');

  const recentCards = useMemo(() => dedupeGradeCardsByDay(cards).slice(0, MAX_TREND_CARDS), [cards]);

  const points = useMemo(() => {
    const ordered = [...recentCards].reverse();
    return ordered
      .map((card) => ({ card, value: valueForFilter(card, filter) }))
      .filter(
        (entry): entry is { card: GradeCard; value: number } => entry.value !== null,
      );
  }, [recentCards, filter]);

  if (recentCards.length === 0) {
    return (
      <div className="rounded-xl border border-slate-300/40 p-4 text-sm text-slate-500">
        Your graded runs will appear here as a trend.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-300/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Grade trend</h3>
        <ForecastGradeSelect
          value={filter}
          ariaLabel="Filter trend by hazard"
          options={[{ value: 'package', label: 'Package' }, ...PRODUCT_KINDS.map((product) => ({ value: product, label: PRODUCT_LABELS[product] }))]}
          onChange={(value) => setFilter(value as TrendFilter)}
        />
      </div>

      {points.length === 0 ? (
        <p className="text-sm text-slate-500">No graded runs for this hazard yet.</p>
      ) : (
        <GradeTrendSvg points={points} onSelectCard={onSelectCard} />
      )}

      <GradeTrendHistory cards={recentCards} onSelectCard={onSelectCard} />
    </div>
  );
};

export default GradeTrendChart;
