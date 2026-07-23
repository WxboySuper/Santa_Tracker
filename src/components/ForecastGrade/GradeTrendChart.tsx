import React, { useMemo, useState } from 'react';
import type { GradeCard } from '../../types/forecastGrade';
import { PRODUCT_KINDS, PRODUCT_LABELS, type ProductKind } from '../../utils/verificationV2';
import GradeTrendHistory from './GradeTrendHistory';
import GradeTrendSvg from './GradeTrendSvg';

interface GradeTrendChartProps {
  cards: GradeCard[];
  onSelectCard?: (card: GradeCard) => void;
}

type TrendFilter = 'package' | ProductKind;

const valueForFilter = (card: GradeCard, filter: TrendFilter): number | null =>
  filter === 'package' ? card.grade : card.productGrades[filter] ?? null;

/**
 * Grade trend for the latest 25 cards, filterable by hazard. Cards are
 * trend-only; selecting one does not reopen a full package for free accounts.
 */
const GradeTrendChart: React.FC<GradeTrendChartProps> = ({ cards, onSelectCard }) => {
  const [filter, setFilter] = useState<TrendFilter>('package');

  const points = useMemo(() => {
    const ordered = [...cards].reverse();
    return ordered
      .map((card) => ({ card, value: valueForFilter(card, filter) }))
      .filter(
        (entry): entry is { card: GradeCard; value: number } =>
          entry.value !== null && Number.isFinite(entry.value)
      );
  }, [cards, filter]);

  if (cards.length === 0) {
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
        <select
          className="fg-touch rounded border border-slate-300/40 bg-transparent px-2 py-1 text-sm"
          value={filter}
          aria-label="Filter trend by hazard"
          onChange={(event) => setFilter(event.target.value as TrendFilter)}
        >
          <option value="package">Package</option>
          {PRODUCT_KINDS.map((product) => (
            <option key={product} value={product}>
              {PRODUCT_LABELS[product]}
            </option>
          ))}
        </select>
      </div>

      {points.length === 0 ? (
        <p className="text-sm text-slate-500">No graded runs for this hazard yet.</p>
      ) : (
        <GradeTrendSvg points={points} onSelectCard={onSelectCard} />
      )}

      <GradeTrendHistory cards={cards} onSelectCard={onSelectCard} />
    </div>
  );
};

export default GradeTrendChart;
