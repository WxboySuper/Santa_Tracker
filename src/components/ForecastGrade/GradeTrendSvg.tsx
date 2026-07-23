import React from 'react';
import type { GradeCard } from '../../types/forecastGrade';
import { formatGrade } from './gradeFormat';

interface TrendPoint {
  card: GradeCard;
  value: number;
}

interface GradeTrendSvgProps {
  points: TrendPoint[];
  onSelectCard?: (card: GradeCard) => void;
}

const WIDTH = 320;
const HEIGHT = 96;

const GradeTrendSvg: React.FC<GradeTrendSvgProps> = ({ points, onSelectCard }) => {
  const step = points.length > 1 ? WIDTH / (points.length - 1) : 0;
  const toY = (value: number) => HEIGHT - (value / 100) * HEIGHT;
  const path = points
    .map((entry, index) => `${index === 0 ? 'M' : 'L'} ${index * step} ${toY(entry.value)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-24 w-full" role="img" aria-label="Grade trend chart">
      <line x1="0" y1={toY(60)} x2={WIDTH} y2={toY(60)} stroke="rgba(148,163,184,0.4)" strokeDasharray="4 4" />
      {points.length > 1 && <path d={path} fill="none" stroke="#2563eb" strokeWidth="2" />}
      {points.map((entry, index) => (
        <circle
          key={entry.card.id}
          cx={index * step}
          cy={toY(entry.value)}
          r={3.5}
          fill="#2563eb"
          className="cursor-pointer"
          onClick={() => onSelectCard?.(entry.card)}
        >
          <title>
            {formatGrade(entry.value)} · {entry.card.reportDate ?? 'today'}
          </title>
        </circle>
      ))}
    </svg>
  );
};

export default GradeTrendSvg;
