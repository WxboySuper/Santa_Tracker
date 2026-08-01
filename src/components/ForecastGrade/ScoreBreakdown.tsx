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

interface ScoreBreakdownValueRowProps {
  value: ComponentScore;
  selected: boolean;
  onSelect: (key: ComponentKey | null) => void;
  weight?: number;
}

interface ScoreBreakdownTableProps {
  product: ProductGrade;
  activeComponent: ComponentKey | null;
  onSelectComponent: (key: ComponentKey | null) => void;
}

/** Renders one keyboard-selectable score or diagnostic row. */
const ScoreBreakdownValueRow: React.FC<ScoreBreakdownValueRowProps> = ({ value, selected, onSelect, weight }) => (
  <tr
    aria-selected={selected}
    className={`fg-report-row border-t border-slate-200/30 align-top ${value.applicable ? '' : 'opacity-60'}`}
    onClick={() => onSelect(selected ? null : value.key)}
    tabIndex={0}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect(selected ? null : value.key);
      }
    }}
  >
    <td className="py-1.5 font-medium">{value.label}</td>
    {weight === undefined ? null : <td className="py-1.5 tabular-nums">{weight}%</td>}
    <td className="py-1.5 tabular-nums">
      {value.applicable ? formatScore(value.score) : <span className="text-amber-600">N/A</span>}
    </td>
    <td className="py-1.5 text-xs text-slate-500">{value.detail}</td>
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
        <ScoreBreakdownValueRow
          key={component.key}
          value={component}
          selected={component.key === activeComponent}
          onSelect={onSelectComponent}
          weight={component.weight}
        />
      ))}
    </tbody>
  </table>
);

interface ScoreBreakdownDiagnosticsProps {
  diagnostics: ComponentScore[];
  activeComponent: ComponentKey | null;
  onSelectComponent: (key: ComponentKey | null) => void;
}

/** Renders the compact header for the technical diagnostic table. */
const ScoreBreakdownDiagnosticsHeader: React.FC = () => (
  <thead>
    <tr className="text-left text-xs uppercase text-slate-500">
      <th className="py-1">Diagnostic</th>
      <th className="py-1">Score</th>
      <th className="py-1">Detail</th>
    </tr>
  </thead>
);

/** Renders the technical diagnostic table separately from headline components. */
const ScoreBreakdownDiagnosticsTable: React.FC<ScoreBreakdownDiagnosticsProps> = ({
  diagnostics,
  activeComponent,
  onSelectComponent,
}) => (
  <table className="w-full text-sm">
    <ScoreBreakdownDiagnosticsHeader />
    <tbody>
      {diagnostics.map((diagnostic) => (
        <ScoreBreakdownValueRow
          key={diagnostic.key}
          value={diagnostic}
          selected={diagnostic.key === activeComponent}
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
    {props.product.diagnostics && props.product.diagnostics.length > 0 ? (
      <>
        <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Technical diagnostics
        </h4>
        <ScoreBreakdownDiagnosticsTable
          diagnostics={props.product.diagnostics}
          activeComponent={props.activeComponent}
          onSelectComponent={props.onSelectComponent}
        />
      </>
    ) : null}
    <p className="mt-2 text-xs text-slate-400">
      Not-evaluated components are renormalized out of the grade. Technical diagnostics are shown
      for context and do not determine the headline grade.
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
