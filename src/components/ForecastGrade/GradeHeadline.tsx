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
        <div className="text-xs uppercase tracking-wide text-slate-500">Forecast Grade</div>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-bold tabular-nums" data-testid="forecast-grade-value">
            {formatGrade(pkg.grade)}
          </span>
          <span className={`text-3xl font-bold ${letterColorClass(pkg.letter)}`}>{pkg.letter ?? '—'}</span>
        </div>
      </div>
      <div className="text-right text-xs text-slate-500">
        <div>Formula {pkg.formulaVersion}</div>
        {pkg.grade === null && <div className="mt-1 text-amber-600">Package grade withheld</div>}
      </div>
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
