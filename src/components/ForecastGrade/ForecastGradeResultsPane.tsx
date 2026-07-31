import React from 'react';
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
}) => (
  <div className="fg-results-pane">
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
          />
        )}
        <DataQualityPanel pkg={result} />
        <ReportTable
          reports={grade.reports}
          product={grade.activeProduct}
          selectedId={selectedReportId}
          onSelect={onSelectReport}
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

export default ForecastGradeResultsPane;
