import React, { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { VerificationMapHandle } from '../Map/VerificationMap';
import { useAppLayout } from '../Layout/AppLayout';
import { useCloudCycles } from '../../hooks/useCloudCycles';
import { deserializeForecast } from '../../utils/fileUtils';
import { setVisibility } from '../../store/stormReportsSlice';
import type { RootState } from '../../store';
import type { MapOutlookLayer, ProductKind } from '../../utils/verificationV2';
import { availablePackageSources } from '../../utils/verificationV2/sources';
import { useForecastGrade } from './useForecastGrade';
import SourcePanel from './SourcePanel';
import RunProgress from './RunProgress';
import GradeHeadline from './GradeHeadline';
import DataQualityPanel from './DataQualityPanel';
import ForecastGradeMapPane from './ForecastGradeMapPane';
import { METHODOLOGY_DOC_PATH } from './methodology';
import './ForecastGradeDashboard.css';

/** Premium cloud package picker rendered inside the source panel. */
const CloudSourcePicker: React.FC<{ onLoad: (id: string, label: string) => void }> = ({ onLoad }) => {
  const { addToast } = useAppLayout();
  const { cycles, loading } = useCloudCycles();
  if (loading) {
    return <p className="text-sm text-slate-500">Loading cloud packages…</p>;
  }
  if (cycles.length === 0) {
    return <p className="text-sm text-slate-500">No cloud packages saved yet.</p>;
  }
  return (
    <label className="block text-sm">
      <span className="font-medium">Cloud package</span>
      <select
        className="fg-touch mt-1 w-full rounded border border-slate-300/40 bg-transparent px-2 py-1"
        defaultValue=""
        onChange={(event) => {
          const value = event.target.value;
          const cycle = cycles.find((item) => item.id === value);
          if (cycle) {
            onLoad(cycle.id, cycle.label ?? 'Cloud package');
            return;
          }
          if (value) {
            addToast('That cloud package is no longer available. Choose another package.', 'error');
            event.target.value = '';
          }
        }}
      >
        <option value="" disabled>
          Choose a saved package…
        </option>
        {cycles.map((cycle) => (
          <option key={cycle.id} value={cycle.id}>
            {cycle.label ?? cycle.id}
          </option>
        ))}
      </select>
    </label>
  );
};

/**
 * Forecast Grade dashboard shell (PR 06 — dashboard-shell).
 *
 * Map-first evidence surface with graded severe-hazard products only. Categorical
 * remains the default map layer for context but is not scored.
 */
const ForecastGradeDashboard: React.FC = () => {
  const { addToast } = useAppLayout();
  const dispatch = useDispatch();
  const grade = useForecastGrade(addToast);
  const { loadCycle } = useCloudCycles();

  const mapRef = useRef<VerificationMapHandle>(null);
  const mapPaneRef = useRef<HTMLDivElement>(null);
  const cloudLoadSeqRef = useRef(0);
  const reportsVisible = useSelector((state: RootState) => state.stormReports.visible);

  const availableSources = availablePackageSources(grade.tier);

  const handleCloudLoad = useCallback(
    async (id: string, label: string) => {
      const loadSeq = ++cloudLoadSeqRef.current;
      const payload = await loadCycle(id);
      if (loadSeq !== cloudLoadSeqRef.current) {
        return;
      }
      if (!payload) {
        addToast('That cloud package could not be loaded.', 'error');
        return;
      }
      try {
        grade.setForecastPackage(deserializeForecast(payload), 'cloud', `${label} (cloud)`);
        addToast('Cloud package loaded. Choose a report date and grade.', 'success');
      } catch {
        addToast('That cloud package could not be parsed.', 'error');
      }
    },
    [addToast, grade, loadCycle]
  );

  const handleSelectProduct = useCallback(
    (product: ProductKind) => {
      grade.setActiveProduct(product);
      grade.setActiveMapLayer(product);
    },
    [grade]
  );

  const handleSelectMapLayer = useCallback(
    (layer: MapOutlookLayer) => {
      grade.setActiveMapLayer(layer);
      if (layer !== 'categorical') {
        grade.setActiveProduct(layer);
      }
    },
    [grade]
  );

  return (
    <div className="fg-dashboard">
      <div className="fg-topbar">
        <div>
          <h2 className="text-lg font-semibold">Forecast Grade</h2>
          <p className="text-xs text-slate-500">
            Map-first verification · formula gfc-ver-1 ·{' '}
            <a className="text-blue-500 hover:underline" href={METHODOLOGY_DOC_PATH} target="_blank" rel="noreferrer">
              Methodology
            </a>
          </p>
        </div>
      </div>

      <div className="fg-workspace">
        <ForecastGradeMapPane
          forecastLoaded={Boolean(grade.forecast)}
          activeMapLayer={grade.activeMapLayer}
          selectedDay={grade.selectedDay}
          availableDays={grade.availableDays}
          reports={grade.reports}
          selectedReportId={null}
          activeComponent={null}
          result={grade.result}
          reportsVisible={reportsVisible}
          onSelectMapLayer={handleSelectMapLayer}
          onSelectDay={grade.setSelectedDay}
          onToggleEvidence={() => dispatch(setVisibility(!reportsVisible))}
          mapPaneRef={mapPaneRef}
          mapRef={mapRef}
        />

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
            renderCloudSource={
              availableSources.includes('cloud')
                ? () => <CloudSourcePicker onLoad={handleCloudLoad} />
                : undefined
            }
          />

          {grade.phase === 'running' && (
            <div className="mt-3">
              <RunProgress progress={grade.progress} />
            </div>
          )}

          {grade.result && (
            <div className="mt-3">
              <GradeHeadline
                pkg={grade.result}
                activeProduct={grade.activeProduct}
                onSelectProduct={handleSelectProduct}
              />
              <DataQualityPanel pkg={grade.result} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForecastGradeDashboard;
