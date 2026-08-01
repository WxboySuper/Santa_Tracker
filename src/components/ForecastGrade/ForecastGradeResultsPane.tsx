import React, { useState } from 'react';
import type { StormReport } from '../../types/stormReports';
import type { GradeCard } from '../../types/forecastGrade';
import type { ComponentKey, PackageGrade, ProductGrade, ProductKind } from '../../utils/verificationV2';
import GradeHeadline from './GradeHeadline';
import ScoreBreakdown from './ScoreBreakdown';
import DataQualityPanel from './DataQualityPanel';
import ReportTable from './ReportTable';
import GradeTrendChart from './GradeTrendChart';
import RunProgress from './RunProgress';
import type { useForecastGrade } from './useForecastGrade';

type GradeState = ReturnType<typeof useForecastGrade>;

interface ForecastGradeResultsPaneProps {
  grade: GradeState;
  activeProductGrade?: ProductGrade;
  activeComponent: ComponentKey | null;
  onSelectComponent: (key: ComponentKey | null) => void;
  selectedReportId: string | null;
  onSelectReport: (report: StormReport | null) => void;
  onSelectProduct: (product: ProductKind) => void;
  onSelectHistoryCard: (card: GradeCard) => void;
  result?: PackageGrade | null;
  afterResult?: React.ReactNode;
}

/** Presents empty, in-progress, and completed verification results. */
const ForecastGradeResultsPane: React.FC<ForecastGradeResultsPaneProps> = ({
  grade,
  activeProductGrade,
  activeComponent,
  onSelectComponent,
  selectedReportId,
  onSelectReport,
  onSelectProduct,
  onSelectHistoryCard,
  result,
  afterResult,
}) => {
  const [openSection, setOpenSection] = useState<'breakdown' | 'quality' | 'reports' | null>(null);
  /** Keeps only one results disclosure open at a time. */
  const toggleSection = (section: 'breakdown' | 'quality' | 'reports') =>
    setOpenSection((current) => (current === section ? null : section));

  return (
  <div className="fg-results-pane">
    {!result && (
      <section className="fg-empty-results" aria-label="Verification result summary">
        <div className="fg-grade-eyebrow">Overall Grade</div>
        <div className="fg-empty-grade">— <span>/ 100</span></div>
        <div className="fg-empty-status">Run verification to calculate a grade</div>
        <div className="fg-empty-divider" />
        <p>Hazard scores and the verification summary will appear here after the package and SPC report date are ready.</p>
      </section>
    )}
    {grade.phase === 'running' && (
      <div className="mt-3">
        <RunProgress progress={grade.progress} />
      </div>
    )}

    {result && (
      <div className="mt-3">
        <GradeHeadline pkg={result} activeProduct={grade.activeProduct} onSelectProduct={onSelectProduct} />
        {activeProductGrade && (
          <ScoreBreakdown
            product={activeProductGrade}
            activeComponent={activeComponent}
            onSelectComponent={onSelectComponent}
            open={openSection === 'breakdown'}
            onToggle={() => toggleSection('breakdown')}
          />
        )}
        <DataQualityPanel pkg={result} open={openSection === 'quality'} onToggle={() => toggleSection('quality')} />
        <ReportTable
          reports={grade.reports}
          product={grade.activeProduct}
          selectedId={selectedReportId}
          onSelect={onSelectReport}
          open={openSection === 'reports'}
          onToggle={() => toggleSection('reports')}
        />
        {afterResult}
      </div>
    )}

    {grade.tier !== 'signed-out' && (
      <div className="mt-3">
        <GradeTrendChart cards={grade.cards} onSelectCard={onSelectHistoryCard} />
      </div>
    )}
  </div>
  );
};

export default ForecastGradeResultsPane;
