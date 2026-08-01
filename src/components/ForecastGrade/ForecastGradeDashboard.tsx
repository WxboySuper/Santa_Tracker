import React, { useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import type { VerificationMapHandle } from '../Map/VerificationMap';
import { useAppLayout } from '../Layout/AppLayout';
import { useCloudCycles } from '../../hooks/useCloudCycles';
import type { RootState } from '../../store';
import type { ComponentKey } from '../../utils/verificationV2';
import { availablePackageSources } from '../../utils/verificationV2/sources';
import { useForecastGrade } from './useForecastGrade';
import { useForecastGradeDashboardActions } from './useForecastGradeDashboardActions';
import ForecastGradeWorkspace from './ForecastGradeWorkspace';
import { METHODOLOGY_DOC_PATH } from './methodology';
import './ForecastGradeDashboard.css';

interface ForecastGradeTopbarProps {
  methodologyPath: string;
}

/** Provides the methodology context for the verification workspace. */
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

/** Coordinates the Forecast Grade source, map, and results workspace. */
const ForecastGradeDashboard: React.FC = () => {
  const { addToast } = useAppLayout();
  const { loadCycle } = useCloudCycles();
  const grade = useForecastGrade(addToast);
  const [activeComponent, setActiveComponent] = useState<ComponentKey | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const mapRef = useRef<VerificationMapHandle>(null);
  const mapPaneRef = useRef<HTMLDivElement>(null);
  const packageLoadSeqRef = useRef(0);
  const reportsVisible = useSelector((state: RootState) => state.stormReports.visible);
  const availableSources = availablePackageSources(grade.tier);
  const activeProductGrade = grade.result?.products.find((product) => product.product === grade.activeProduct);
  const actions = useForecastGradeDashboardActions({
    addToast,
    grade,
    loadCycle,
    packageLoadSeqRef,
    reportsVisible,
    setActiveComponent,
    setSelectedReportId,
  });

  return (
    <div className="fg-dashboard">
      <ForecastGradeTopbar methodologyPath={METHODOLOGY_DOC_PATH} />
      <ForecastGradeWorkspace
        addToast={addToast}
        availableSources={availableSources}
        grade={grade}
        activeComponent={activeComponent}
        activeProductGrade={activeProductGrade}
        reportsVisible={reportsVisible}
        selectedReportId={selectedReportId}
        mapRef={mapRef}
        mapPaneRef={mapPaneRef}
        onFile={actions.handleFileLoad}
        onCloudLoad={actions.handleCloudLoad}
        onReset={actions.handleReset}
        onSelectComponent={setActiveComponent}
        onSelectMapLayer={actions.handleSelectMapLayer}
        onSelectProduct={actions.handleSelectProduct}
        onSelectReport={actions.handleSelectReport}
        onSelectHistoryCard={actions.handleSelectHistoryCard}
        onToggleEvidence={actions.handleToggleEvidence}
      />
    </div>
  );
};

export default ForecastGradeDashboard;
