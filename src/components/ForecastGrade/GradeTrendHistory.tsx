import React from 'react';
import type { GradeCard } from '../../types/forecastGrade';
import { formatGrade } from './gradeFormat';

interface GradeTrendHistoryProps {
  cards: GradeCard[];
  onSelectCard?: (card: GradeCard) => void;
}

const GradeTrendHistory: React.FC<GradeTrendHistoryProps> = ({ cards, onSelectCard }) => (
  <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-slate-500">
    {cards.slice(0, 6).map((card) => {
      if (card.grade === null || !Number.isFinite(card.grade)) {
        return null;
      }
      return (
        <li key={card.id}>
          <button
            type="button"
            className="w-full text-left rounded px-1 py-0.5 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500"
            onClick={() => onSelectCard?.(card)}
            aria-label={`Restore grade ${card.letter ?? ''} from ${card.reportDate ?? 'today'}`}
          >
            {formatGrade(card.grade)} {card.letter ?? ''} · {card.reportDate ?? 'today'} · {card.dataQuality}
          </button>
        </li>
      );
    })}
  </ul>
);

export default GradeTrendHistory;
