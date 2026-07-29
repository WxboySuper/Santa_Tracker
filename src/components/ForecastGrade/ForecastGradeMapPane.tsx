import React from 'react';
import VerificationMap, { type VerificationMapHandle } from '../Map/VerificationMap';
import type { DayType } from '../../types/outlooks';
import type { MapOutlookLayer, PackageGrade } from '../../utils/verificationV2';
import ForecastGradeMapControls from './ForecastGradeMapControls';
import { formatGrade, letterColorClass } from './gradeFormat';

interface ForecastGradeMapPaneProps {
  forecastLoaded: boolean;
  activeMapLayer: MapOutlookLayer;
  selectedDay: DayType;
  availableDays: DayType[];
  result: PackageGrade | null;
  reportsVisible: boolean;
  onSelectMapLayer: (layer: MapOutlookLayer) => void;
  onSelectDay: (day: never) => void;
  onToggleEvidence: () => void;
  mapPaneRef: React.RefObject<HTMLDivElement | null>;
  mapRef: React.RefObject<VerificationMapHandle | null>;
}

/** Map-first evidence surface for the dashboard shell (PR 06c). */
const ForecastGradeMapPane: React.FC<ForecastGradeMapPaneProps> = ({
  forecastLoaded,
  activeMapLayer,
  selectedDay,
  availableDays,
  result,
  reportsVisible,
  onSelectMapLayer,
  onSelectDay,
  onToggleEvidence,
  mapPaneRef,
  mapRef,
}) => (
  <div className="fg-map-pane" ref={mapPaneRef}>
    {forecastLoaded ? (
      <>
        <VerificationMap ref={mapRef} activeOutlookType={activeMapLayer} selectedDay={selectedDay} />
        <ForecastGradeMapControls
          activeMapLayer={activeMapLayer}
          onSelectMapLayer={onSelectMapLayer}
          availableDays={availableDays}
          selectedDay={selectedDay}
          onSelectDay={onSelectDay}
          reportsVisible={reportsVisible}
          onToggleEvidence={onToggleEvidence}
        />
        {result && (
          <div className="fg-grade-overlay">
            <span className="text-2xl font-bold tabular-nums">{formatGrade(result.grade)}</span>
            <span className={`text-xl font-bold ${letterColorClass(result.letter)}`}>
              {result.letter ?? '—'}
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
);

export default ForecastGradeMapPane;
