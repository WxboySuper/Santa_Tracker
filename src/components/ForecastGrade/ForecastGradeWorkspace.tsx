import React from 'react';
import type { MutableRefObject } from 'react';
import type { VerificationMapHandle } from '../Map/VerificationMap';
import type { StormReport } from '../../types/stormReports';
import type { ComponentKey, MapOutlookLayer, ProductGrade, ProductKind } from '../../utils/verificationV2';
import type { useForecastGrade } from './useForecastGrade';
import type { availablePackageSources } from '../../utils/verificationV2/sources';
import CloudSourcePicker from './CloudSourcePicker';
import ForecastGradeMapPane from './ForecastGradeMapPane';
import ForecastGradeResultsPane from './ForecastGradeResultsPane';
import SourcePanel from './SourcePanel';

type GradeController = ReturnType<typeof useForecastGrade>;
type AvailableSources = ReturnType<typeof availablePackageSources>;
interface ForecastGradeWorkspaceProps {
  availableSources: AvailableSources;
  grade: GradeController;
  activeComponent: ComponentKey | null;
  activeProductGrade?: ProductGrade;
  reportsVisible: boolean;
  datVisible: boolean;
  selectedReportId: string | null;
  mapRef: MutableRefObject<VerificationMapHandle | null>;
  mapPaneRef: MutableRefObject<HTMLDivElement | null>;
  onFile: (file: File) => void;
  onCloudLoad: (id: string, label: string) => void;
  onReset: () => void;
  onSelectComponent: React.Dispatch<React.SetStateAction<ComponentKey | null>>;
  onSelectMapLayer: (layer: MapOutlookLayer) => void;
  onSelectProduct: (product: ProductKind) => void;
  onSelectReport: (report: StormReport | null) => void;
  onSelectHistoryCard: (card: Parameters<GradeController['restoreCard']>[0]) => void;
  onToggleEvidence: () => void;
  onToggleDat: () => void;
}

/** Composes the source rail, evidence map, and verification results rail. */
const ForecastGradeWorkspace: React.FC<ForecastGradeWorkspaceProps> = ({
  availableSources,
  grade,
  activeComponent,
  activeProductGrade,
  reportsVisible,
  datVisible,
  selectedReportId,
  mapRef,
  mapPaneRef,
  onFile,
  onCloudLoad,
  onReset,
  onSelectComponent,
  onSelectMapLayer,
  onSelectProduct,
  onSelectReport,
  onSelectHistoryCard,
  onToggleEvidence,
  onToggleDat,
}) => (
  <div className="fg-workspace">
    <aside className="fg-source-rail">
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
        onFile={onFile}
        onUseTodayChange={grade.setUseToday}
        onReportDateChange={grade.setReportDate}
        onRun={grade.run}
        onReset={onReset}
        renderCloudSource={availableSources.includes('cloud') ? () => <CloudSourcePicker onLoad={onCloudLoad} /> : undefined}
      />
    </aside>
    <main className="fg-analysis-column">
      <ForecastGradeMapPane
        forecastLoaded={Boolean(grade.forecast)}
        activeMapLayer={grade.activeMapLayer}
        selectedDay={grade.selectedDay}
        availableDays={grade.availableDays}
        reports={grade.reports}
        datEvidence={grade.datEvidence}
        datVisible={datVisible}
        selectedReportId={selectedReportId}
        activeComponent={activeComponent}
        result={grade.result}
        reportsVisible={reportsVisible}
        onSelectMapLayer={onSelectMapLayer}
        onSelectDay={grade.setSelectedDay}
        onToggleEvidence={onToggleEvidence}
        onToggleDat={onToggleDat}
        mapPaneRef={mapPaneRef}
        mapRef={mapRef}
      />
    </main>
    <ForecastGradeResultsPane
      grade={grade}
      activeProductGrade={activeProductGrade}
      activeComponent={activeComponent}
      onSelectComponent={onSelectComponent}
      selectedReportId={selectedReportId}
      onSelectReport={onSelectReport}
      onSelectProduct={onSelectProduct}
      onSelectHistoryCard={onSelectHistoryCard}
      result={grade.result}
    />
  </div>
);

export default ForecastGradeWorkspace;
