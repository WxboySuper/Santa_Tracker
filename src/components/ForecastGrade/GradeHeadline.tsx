import React from 'react';
import type { PackageGrade, ProductKind } from '../../utils/verificationV2';
import { formatGrade, letterColorClass } from './gradeFormat';

interface GradeHeadlineProps {
  pkg: PackageGrade;
  activeProduct: ProductKind;
  onSelectProduct: (product: ProductKind) => void;
}

/**
 * Learn-fast headline: the package Forecast Grade (0–100 + letter, one decimal)
 * with a row of per-product grades. Selecting a product emphasizes its geometry
 * on the map and scrolls its breakdown into focus. No coaching prose.
 */
const GradeHeadline: React.FC<GradeHeadlineProps> = ({ pkg, activeProduct, onSelectProduct }) => (
  <div className="mb-3 rounded-xl border border-slate-300/40 p-4">
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <div className="fg-grade-eyebrow">Overall Grade</div>
        <div className="flex items-baseline gap-2">
          <span className="fg-grade-value text-5xl font-bold tabular-nums" data-testid="forecast-grade-value">
            {formatGrade(pkg.grade)}
          </span>
          <span className="fg-grade-out-of">/ 100</span>
        </div>
        <div className={`fg-grade-letter ${letterColorClass(pkg.letter)}`}>{pkg.letter ?? '—'} <span>|</span> {pkg.dataQuality}</div>
      </div>
      <div className="text-right text-xs text-slate-500">
        <div>Formula {pkg.formulaVersion}</div>
        {pkg.grade === null && <div className="mt-1 text-amber-600">Package grade withheld</div>}
      </div>
    </div>

    <div className="fg-grade-summary">
      <div><strong>Hazard Scores</strong>{pkg.products.map((product) => <span key={product.product}><i className={`fg-hazard-dot fg-hazard-dot--${product.product}`} />{product.label}<b>{product.applicable ? formatGrade(product.grade) : '—'}</b></span>)}</div>
      <div><strong>Summary</strong><span>Reports used <b>{pkg.products.reduce((total, product) => total + product.reportCount, 0)}</b></span><span>Data quality <b>{pkg.dataQuality}</b></span><span>Formula <b>{pkg.formulaVersion}</b></span></div>
    </div>
    <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Product grades">
      {pkg.products.map((product) => {
        const selected = product.product === activeProduct;
        return (
          <button
            key={product.product}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelectProduct(product.product)}
            className={`fg-touch rounded-lg border px-3 py-1 text-sm ${
              selected ? 'border-blue-500 bg-blue-500/10' : 'border-slate-300/40'
            } ${product.applicable ? '' : 'opacity-60'}`}
          >
            <span className="font-medium">{product.label}</span>{' '}
            <span className={`font-semibold ${letterColorClass(product.letter)}`}>
              {product.applicable ? `${formatGrade(product.grade)} ${product.letter ?? ''}` : 'Not evaluated'}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

export default GradeHeadline;
