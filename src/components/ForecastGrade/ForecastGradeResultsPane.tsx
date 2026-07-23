import React from 'react';
import type { StormReport } from '../../types/stormReports';
import type { GradeCard, PackageSourceKind } from '../../types/forecastGrade';
import type { ComponentKey, PackageGrade, ProductGrade, ProductKind } from '../../utils/verificationV2';
import GradeHeadline from './GradeHeadline';
import ScoreBreakdown from './ScoreBreakdown';
import DataQualityPanel from './DataQualityPanel';
import ReportTable from './ReportTable';
import GradeTrendChart from './GradeTrendChart';
import RunProgress from './RunProgress';
import SourcePanel from './SourcePanel';
import type { useForecastGrade } from './useForecastGrade';

type GradeState = ReturnType<typeof useForecastGrade>;

interface ForecastGradeResultsPaneProps {
  grade: GradeState;
  availableSources: PackageSourceKind[];
  renderCloudSource?: () => React.ReactNode;
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
  availableSources,
  renderCloudSource,
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
    <SourcePanel
      tier={grade.tier}
      availableSources={availableSources}
      hasForecast={Boolean(grade.forecast)}
      sourceLabel={grade.sourceLabel}
      useToday={grade.useToday}
      reportDate={grade.reportDate}
      canRun={grade.canRun}
      isRunning={grade.phase === 'running'}
      error={grade.error}
      onFile={grade.loadFromFile}
      onUseTodayChange={grade.setUseToday}
      onReportDateChange={grade.setReportDate}
      onRun={grade.run}
      onReset={grade.reset}
      renderCloudSource={renderCloudSource}
    />

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
