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

interface ScoreBreakdownDiagnosticsProps {
  diagnostics: ComponentScore[];
  activeComponent: ComponentKey | null;
  onSelectComponent: (key: ComponentKey | null) => void;
}

interface ScoreBreakdownDiagnosticRowProps {
  diagnostic: ComponentScore;
  selected: boolean;
  onSelect: (key: ComponentKey | null) => void;
}

/** Renders one keyboard-selectable technical diagnostic row. */
const ScoreBreakdownDiagnosticRow: React.FC<ScoreBreakdownDiagnosticRowProps> = ({
  diagnostic,
  selected,
  onSelect,
}) => (
  <tr
    aria-selected={selected}
    className={`fg-report-row border-t border-slate-200/30 align-top ${diagnostic.applicable ? '' : 'opacity-60'}`}
    onClick={() => onSelect(selected ? null : diagnostic.key)}
    tabIndex={0}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect(selected ? null : diagnostic.key);
      }
    }}
  >
    <td className="py-1.5 font-medium">{diagnostic.label}</td>
    <td className="py-1.5 tabular-nums">
      {diagnostic.applicable ? formatScore(diagnostic.score) : <span className="text-amber-600">N/A</span>}
    </td>
    <td className="py-1.5 text-xs text-slate-500">{diagnostic.detail}</td>
  </tr>
);

/** Renders technical diagnostics separately from the headline score components. */
const ScoreBreakdownDiagnostics: React.FC<ScoreBreakdownDiagnosticsProps> = ({
  diagnostics,
  activeComponent,
  onSelectComponent,
}) => (
  <>
    <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
      Technical diagnostics
    </h4>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase text-slate-500">
          <th className="py-1">Diagnostic</th>
          <th className="py-1">Score</th>
          <th className="py-1">Detail</th>
        </tr>
      </thead>
      <tbody>
        {diagnostics.map((diagnostic) => (
          <ScoreBreakdownDiagnosticRow
            key={diagnostic.key}
            diagnostic={diagnostic}
            selected={diagnostic.key === activeComponent}
            onSelect={onSelectComponent}
          />
        ))}
      </tbody>
    </table>
  </>
);

/** Renders the score table and its explanatory note. */
const ScoreBreakdownBody: React.FC<ScoreBreakdownTableProps> = (props) => (
  <div className="fg-section-body">
    <ScoreBreakdownTable {...props} />
    {props.product.diagnostics && props.product.diagnostics.length > 0 ? (
      <ScoreBreakdownDiagnostics
        diagnostics={props.product.diagnostics}
        activeComponent={props.activeComponent}
        onSelectComponent={props.onSelectComponent}
      />
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
