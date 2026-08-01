import React from 'react';
import type { ComponentKey, ComponentScore, ProductGrade } from '../../utils/verificationV2';
import { formatGrade, formatScore } from './gradeFormat';

interface ScoreBreakdownProps {
  product: ProductGrade;
  activeComponent: ComponentKey | null;
  onSelectComponent: (key: ComponentKey | null) => void;
  open?: boolean;
  onToggle?: () => void;
}

interface ScoreBreakdownRowProps {
  component: ComponentScore;
  selected: boolean;
  onSelect: (key: ComponentKey | null) => void;
}

interface ScoreBreakdownTableProps {
  product: ProductGrade;
  activeComponent: ComponentKey | null;
  onSelectComponent: (key: ComponentKey | null) => void;
}

/** Renders one keyboard-selectable score component row. */
const ScoreBreakdownRow: React.FC<ScoreBreakdownRowProps> = ({ component, selected, onSelect }) => (
  <tr
    aria-selected={selected}
    className={`fg-report-row border-t border-slate-200/30 align-top ${component.applicable ? '' : 'opacity-60'}`}
    onClick={() => onSelect(selected ? null : component.key)}
    tabIndex={0}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect(selected ? null : component.key);
      }
    }}
  >
    <td className="py-1.5 font-medium">{component.label}</td>
    <td className="py-1.5 tabular-nums">{component.weight}%</td>
    <td className="py-1.5 tabular-nums">
      {component.applicable ? formatScore(component.score) : <span className="text-amber-600">N/A</span>}
    </td>
    <td className="py-1.5 text-xs text-slate-500">{component.detail}</td>
  </tr>
);

/** Renders the score component table and delegates row interaction. */
const ScoreBreakdownTable: React.FC<ScoreBreakdownTableProps> = ({ product, activeComponent, onSelectComponent }) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="text-left text-xs uppercase text-slate-500">
        <th className="py-1">Component</th>
        <th className="py-1">Weight</th>
        <th className="py-1">Score</th>
        <th className="py-1">Detail</th>
      </tr>
    </thead>
    <tbody>
      {product.components.map((component) => (
        <ScoreBreakdownRow
          key={component.key}
          component={component}
          selected={component.key === activeComponent}
          onSelect={onSelectComponent}
        />
      ))}
    </tbody>
  </table>
);

/** Renders the score table and its explanatory note. */
const ScoreBreakdownBody: React.FC<ScoreBreakdownTableProps> = (props) => (
  <div className="fg-section-body">
    <ScoreBreakdownTable {...props} />
    <p className="mt-2 text-xs text-slate-400">
      Not-evaluated components are renormalized out of the grade. Diagnostics do not by themselves
      determine the grade.
    </p>
  </div>
);

/**
 * The exactly-titled "Score breakdown" section. Progressive disclosure via a
 * labeled expandable, not a Basic/Advanced switch. Selecting a component
 * emphasizes its related geometry on the map. Metrics only — no coaching.
 */
const ScoreBreakdown: React.FC<ScoreBreakdownProps> = ({
  product,
  activeComponent,
  onSelectComponent,
  open,
  onToggle,
}) => (
  <details className="fg-section" open={open}>
    <summary onClick={onToggle ? (event) => { event.preventDefault(); onToggle(); } : undefined}>
      <span>Score breakdown</span>
      <span className="text-sm text-slate-500">
        {product.label} {product.applicable ? formatGrade(product.grade) : 'Not evaluated'}
      </span>
    </summary>
    <ScoreBreakdownBody product={product} activeComponent={activeComponent} onSelectComponent={onSelectComponent} />
  </details>
);

export default ScoreBreakdown;
