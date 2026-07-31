import React, { useCallback, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { VerificationMapHandle } from '../Map/VerificationMap';
import { useAppLayout } from '../Layout/AppLayout';
import { useCloudCycles } from '../../hooks/useCloudCycles';
import { setVisibility } from '../../store/stormReportsSlice';
import type { RootState } from '../../store';
import type { StormReport } from '../../types/stormReports';
import type { GradeCard } from '../../types/forecastGrade';
import type { ComponentKey, MapOutlookLayer, ProductKind } from '../../utils/verificationV2';
import { availablePackageSources } from '../../utils/verificationV2/sources';
import { useForecastGrade } from './useForecastGrade';
import { useCloudLoadHandler } from './useCloudLoadHandler';
import CloudSourcePicker from './CloudSourcePicker';
import ForecastGradeMapPane from './ForecastGradeMapPane';
import ForecastGradeResultsPane from './ForecastGradeResultsPane';
import SourcePanel from './SourcePanel';
import { METHODOLOGY_DOC_PATH } from './methodology';
import './ForecastGradeDashboard.css';

interface ForecastGradeTopbarProps {
  methodologyPath: string;
}

/** Title row with the formula version and methodology link. */
const ForecastGradeTopbar: React.FC<ForecastGradeTopbarProps> = ({ methodologyPath }) => (
  <div className="fg-topbar">
    <div>
      <div className="fg-kicker">Verification workspace</div>
      <h2>Forecast Grade</h2>
      <p>
        Compare the outlook against SPC evidence · formula gfc-ver-1 ·{' '}
        <a className="text-blue-500 hover:underline" href={methodologyPath} target="_blank" rel="noreferrer">
          Methodology
        </a>
      </p>
    </div>
  </div>
);

const ForecastGradeDashboard: React.FC = () => {
  const { addToast } = useAppLayout();
  const dispatch = useDispatch();
  const grade = useForecastGrade(addToast);
  const { loadCycle } = useCloudCycles();

  const [activeComponent, setActiveComponent] = useState<ComponentKey | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const mapRef = useRef<VerificationMapHandle>(null);
  const mapPaneRef = useRef<HTMLDivElement>(null);
  // Shared sequence bumped by every package-loading and reset path so an in-flight
  // cloud load cannot overwrite a newer file (or vice versa).
  const packageLoadSeqRef = useRef(0);
  const reportsVisible = useSelector((state: RootState) => state.stormReports.visible);

  const availableSources = availablePackageSources(grade.tier);
  const activeProductGrade = grade.result?.products.find((product) => product.product === grade.activeProduct);

  const handleCloudLoad = useCloudLoadHandler(packageLoadSeqRef, addToast, grade, loadCycle);

  const handleFileLoad = useCallback(
    (file: File) => {
      packageLoadSeqRef.current += 1;
      void grade.loadFromFile(file);
    },
    [grade]
  );

  const handleReset = useCallback(() => {
    packageLoadSeqRef.current += 1;
    grade.reset();
  }, [grade]);
  const handleSelectProduct = useCallback(
    (product: ProductKind) => {
      grade.setActiveProduct(product);
      grade.setActiveMapLayer(product);
      setActiveComponent(null);
    },
    [grade]
  );

  const handleSelectMapLayer = useCallback(
    (layer: MapOutlookLayer) => {
      grade.setActiveMapLayer(layer);
      if (layer !== 'categorical') {
        grade.setActiveProduct(layer);
        setActiveComponent(null);
      }
    },
    [grade]
  );

  const handleToggleEvidence = useCallback(
    () => dispatch(setVisibility(!reportsVisible)),
    [dispatch, reportsVisible]
  );

  const handleSelectReport = useCallback((report: StormReport | null) => {
    setSelectedReportId(report?.id ?? null);
  }, []);
  const handleSelectReportId = useCallback((reportId: string | null) => {
    setSelectedReportId(reportId);
  }, []);
  const handleSelectHistoryCard = useCallback(
    (card: GradeCard) => {
      const snapshot = grade.restoreCard(card);
      if (snapshot) {
        grade.applyGradeSnapshot(snapshot);
        addToast('Restored grade package from history.', 'success');
      } else {
        addToast('This grade card is trend-only and cannot reopen a full package.', 'info');
      }
    },
    [addToast, grade]
  );
  const renderCloudSource = availableSources.includes('cloud')
    ? () => <CloudSourcePicker onLoad={handleCloudLoad} />
    : undefined;
  return (
    <div className="fg-dashboard">
      <ForecastGradeTopbar methodologyPath={METHODOLOGY_DOC_PATH} />
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
            onFile={handleFileLoad}
            onUseTodayChange={grade.setUseToday}
            onReportDateChange={grade.setReportDate}
            onRun={grade.run}
            onReset={grade.reset}
            renderCloudSource={renderCloudSource}
          />
        </aside>
        <main className="fg-analysis-column">
          <ForecastGradeMapPane
          forecastLoaded={Boolean(grade.forecast)}
          activeMapLayer={grade.activeMapLayer}
          selectedDay={grade.selectedDay}
          availableDays={grade.availableDays}
          reports={grade.reports}
          selectedReportId={selectedReportId}
          activeComponent={activeComponent}
          result={grade.result}
          reportsVisible={reportsVisible}
          isRunning={grade.phase === 'running'}
          progress={grade.progress}
          onSelectMapLayer={handleSelectMapLayer}
          onSelectDay={grade.setSelectedDay}
          onToggleEvidence={handleToggleEvidence}
          onSelectReportId={handleSelectReportId}
          mapPaneRef={mapPaneRef}
          mapRef={mapRef}
          />
        </main>

        <ForecastGradeResultsPane
          grade={grade}
          activeProductGrade={activeProductGrade}
          activeComponent={activeComponent}
          onSelectComponent={setActiveComponent}
          selectedReportId={selectedReportId}
          onSelectReport={handleSelectReport}
          onSelectProduct={handleSelectProduct}
          onSelectHistoryCard={handleSelectHistoryCard}
          result={grade.result}
        />
      </div>
    </div>
  );
};

export default ForecastGradeDashboard;
