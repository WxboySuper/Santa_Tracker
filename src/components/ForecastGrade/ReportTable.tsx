import React, { useMemo } from 'react';
import type { StormReport } from '../../types/stormReports';
import type { ProductKind } from '../../utils/verificationV2';
import { relevantReportTypes } from '../../utils/verificationV2';

interface ReportTableProps {
  reports: StormReport[];
  product: ProductKind;
  selectedId: string | null;
  onSelect: (report: StormReport | null) => void;
}

/**
 * Selectable report table — the keyboard/screen-reader equivalent of map
 * highlights. The map stays primary; selecting a row here emphasizes the same
 * report on the map and vice versa.
 */
const ReportTable: React.FC<ReportTableProps> = ({ reports, product, selectedId, onSelect }) => {
  const types = relevantReportTypes(product);
  const filtered = useMemo(
    () => reports.filter((report) => types.includes(report.type as never)),
    [reports, types]
  );

  return (
    <details className="fg-section">
      <summary>
        <span>Storm reports</span>
        <span className="text-sm text-slate-500">{filtered.length}</span>
      </summary>
      <div className="fg-section-body">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500">No {product} reports for this run.</p>
        ) : (
          <table className="w-full text-sm" aria-label={`${product} storm reports`}>
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="py-1">Type</th>
                <th className="py-1">Location</th>
                <th className="py-1">Mag</th>
                <th className="py-1">Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((report) => {
                const selected = report.id === selectedId;
                return (
                  <tr
                    key={report.id}
                    aria-selected={selected}
                    className="fg-report-row border-t border-slate-200/30"
                    tabIndex={0}
                    onClick={() => onSelect(selected ? null : report)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(selected ? null : report);
                      }
                    }}
                  >
                    <td className="py-1.5 capitalize">{report.type}</td>
                    <td className="py-1.5">
                      {report.location}, {report.state}
                    </td>
                    <td className="py-1.5 tabular-nums">{report.magnitude ?? '—'}</td>
                    <td className="py-1.5 tabular-nums">{report.time}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
};

export default ReportTable;
