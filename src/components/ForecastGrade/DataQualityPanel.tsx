import React from 'react';
import type { PackageGrade } from '../../utils/verificationV2';
import { dataQualityClass } from './gradeFormat';

interface DataQualityPanelProps {
  pkg: PackageGrade;
  defaultOpen?: boolean;
}

/**
 * The exactly-titled "Data quality" section. Reports Good / Limited / Blocked,
 * a "No reports" label on quiet days (never a fake confidence label), and a
 * Not-evaluated row per missing product with classic warning treatment.
 */
const DataQualityPanel: React.FC<DataQualityPanelProps> = ({ pkg, defaultOpen = false }) => {
  const missing = pkg.products.filter((product) => !product.applicable);

  return (
    <details className="fg-section" open={defaultOpen}>
      <summary>
        <span>Data quality</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${dataQualityClass(pkg.dataQuality)}`}>
          {pkg.dataQuality}
        </span>
      </summary>
      <div className="fg-section-body">
        <p className="text-sm text-slate-500">{pkg.dataQualityReason}</p>
        {!pkg.hasReports && (
          <p className="mt-1 text-sm font-medium text-slate-500">No reports for this date.</p>
        )}

        {missing.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <div className="text-xs font-semibold uppercase text-amber-700">Not evaluated</div>
            <ul className="mt-1 text-sm text-amber-700">
              {missing.map((product) => (
                <li key={product.product}>
                  {product.label} — not present in this package
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-amber-600/80">
              A complete package (categorical + hazards) grades every product.
            </p>
          </div>
        )}
      </div>
    </details>
  );
};

export default DataQualityPanel;
