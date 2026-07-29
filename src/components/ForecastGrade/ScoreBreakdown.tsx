import React from 'react';
import type { ComponentKey, ProductGrade } from '../../utils/verificationV2';
import { formatGrade, formatScore } from './gradeFormat';

interface ScoreBreakdownProps {
  product: ProductGrade;
  activeComponent: ComponentKey | null;
  onSelectComponent: (key: ComponentKey | null) => void;
  defaultOpen?: boolean;
}

/**
 * The exactly-titled "Score breakdown" section. Progressive disclosure via a
 * labeled expandable, not a Basic/Advanced switch. Selecting a component
 * emphasizes its related geometry on the map. Metrics only — no coaching.
 */
const ScoreBreakdown: React.FC<ScoreBreakdownProps> = ({
  product,
  activeComponent,
  onSelectComponent,
  defaultOpen = true,
}) => (
  <details className="fg-section" open={defaultOpen}>
    <summary>
      <span>Score breakdown</span>
      <span className="text-sm text-slate-500">
        {product.label} {product.applicable ? formatGrade(product.grade) : 'Not evaluated'}
      </span>
    </summary>
    <div className="fg-section-body">
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
          {product.components.map((component) => {
            const selected = component.key === activeComponent;
            return (
              <tr
                key={component.key}
                aria-selected={selected}
                className={`fg-report-row border-t border-slate-200/30 align-top ${
                  component.applicable ? '' : 'opacity-60'
                }`}
                onClick={() => onSelectComponent(selected ? null : component.key)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectComponent(selected ? null : component.key);
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
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-400">
        Not-evaluated components are renormalized out of the grade. Diagnostics do not by themselves
        determine the grade.
      </p>
    </div>
  </details>
);

export default ScoreBreakdown;
