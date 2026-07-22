import React, { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Eye, EyeOff } from 'lucide-react';
import VerificationMap, { type VerificationMapHandle } from '../Map/VerificationMap';
import { useAppLayout } from '../Layout/AppLayout';
import { useCloudCycles } from '../../hooks/useCloudCycles';
import { deserializeForecast } from '../../utils/fileUtils';
import { setVisibility } from '../../store/stormReportsSlice';
import type { RootState } from '../../store';
import type { ProductKind } from '../../utils/verificationV2';
import { availablePackageSources } from '../../utils/verificationV2/sources';
import { useForecastGrade } from './useForecastGrade';
import SourcePanel from './SourcePanel';
import RunProgress from './RunProgress';
import GradeHeadline from './GradeHeadline';
import DataQualityPanel from './DataQualityPanel';
import { formatGrade, letterColorClass } from './gradeFormat';
import { METHODOLOGY_DOC_PATH } from './methodology';
import './ForecastGradeDashboard.css';

const MAP_PRODUCTS: ProductKind[] = ['categorical', 'tornado', 'wind', 'hail'];

/** Premium cloud package picker rendered inside the source panel. */
const CloudSourcePicker: React.FC<{ onLoad: (id: string, label: string) => void }> = ({ onLoad }) => {
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
          const cycle = cycles.find((item) => item.id === event.target.value);
          if (cycle) {
            onLoad(cycle.id, cycle.label ?? 'Cloud package');
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
 * Map-first evidence surface with an equal-weight results dashboard on desktop
 * and a map-first compact overlay on mobile/landscape. Owns explicit source
 * selection, staged run progress, the learn-fast grade headline, and the data
 * quality gate. The detailed result workspace (breakdown, report table, trend,
 * share) is layered on top in later PRs. Only mounts when verificationRelaunch
 * is exposed; classic VerificationMode remains the default when the flag is off.
 */
const ForecastGradeDashboard: React.FC = () => {
  const { addToast } = useAppLayout();
  const dispatch = useDispatch();
  const grade = useForecastGrade(addToast);
  const { loadCycle } = useCloudCycles();

  const mapRef = useRef<VerificationMapHandle>(null);
  const mapPaneRef = useRef<HTMLDivElement>(null);
  const reportsVisible = useSelector((state: RootState) => state.stormReports.visible);

  const availableSources = availablePackageSources(grade.tier);

  const handleCloudLoad = useCallback(
    async (id: string, label: string) => {
      const payload = await loadCycle(id);
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

  const showMap = Boolean(grade.forecast);

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
        <div className="fg-map-pane" ref={mapPaneRef}>
          {showMap ? (
            <>
              <VerificationMap
                ref={mapRef}
                activeOutlookType={grade.activeProduct as 'categorical' | 'tornado' | 'wind' | 'hail'}
                selectedDay={grade.selectedDay}
              />
              <MapControls
                activeProduct={grade.activeProduct}
                onSelectProduct={grade.setActiveProduct}
                availableDays={grade.availableDays}
                selectedDay={grade.selectedDay}
                onSelectDay={grade.setSelectedDay}
                reportsVisible={reportsVisible}
                onToggleEvidence={() => dispatch(setVisibility(!reportsVisible))}
              />
              {grade.result && (
                <div className="fg-grade-overlay">
                  <span className="text-2xl font-bold tabular-nums">{formatGrade(grade.result.grade)}</span>
                  <span className={`text-xl font-bold ${letterColorClass(grade.result.letter)}`}>
                    {grade.result.letter ?? '—'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
              The map becomes the evidence surface once you load a package and grade a date.
            </div>
          )}
        </div>

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
                onSelectProduct={grade.setActiveProduct}
              />
              <DataQualityPanel pkg={grade.result} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface MapControlsProps {
  activeProduct: ProductKind;
  onSelectProduct: (product: ProductKind) => void;
  availableDays: number[];
  selectedDay: number;
  onSelectDay: (day: never) => void;
  reportsVisible: boolean;
  onToggleEvidence: () => void;
}

/** Always-reachable map controls: hazard, day, and evidence. */
const MapControls: React.FC<MapControlsProps> = ({
  activeProduct,
  onSelectProduct,
  availableDays,
  selectedDay,
  onSelectDay,
  reportsVisible,
  onToggleEvidence,
}) => (
  <div className="absolute left-2 top-2 z-[5] flex flex-wrap items-center gap-1 rounded-lg bg-slate-900/75 p-1 text-xs text-white">
    <div className="flex gap-1" role="group" aria-label="Hazard">
      {MAP_PRODUCTS.map((product) => (
        <button
          key={product}
          type="button"
          className={`fg-touch rounded px-2 py-1 capitalize ${
            activeProduct === product ? 'bg-blue-500' : 'bg-white/10'
          }`}
          onClick={() => onSelectProduct(product)}
        >
          {product === 'categorical' ? 'Cat' : product}
        </button>
      ))}
    </div>
    {availableDays.length > 1 && (
      <select
        className="fg-touch rounded bg-white/10 px-2 py-1"
        value={selectedDay}
        aria-label="Forecast day"
        onChange={(event) => onSelectDay(Number(event.target.value) as never)}
      >
        {availableDays.map((day) => (
          <option key={day} value={day} className="text-black">
            Day {day}
          </option>
        ))}
      </select>
    )}
    <button
      type="button"
      className="fg-touch inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1"
      onClick={onToggleEvidence}
      aria-pressed={reportsVisible}
    >
      {reportsVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      Evidence
    </button>
  </div>
);

export default ForecastGradeDashboard;
