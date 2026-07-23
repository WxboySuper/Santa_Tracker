import React, { useEffect, useRef } from 'react';
import { fromLonLat } from 'ol/proj';
import VerificationMap, { type VerificationMapHandle } from '../Map/VerificationMap';
import type { StormReport } from '../../types/stormReports';
import type { ComponentKey, MapOutlookLayer, PackageGrade } from '../../utils/verificationV2';
import ForecastGradeMapControls from './ForecastGradeMapControls';
import { formatGrade, letterColorClass } from './gradeFormat';

interface ForecastGradeMapPaneProps {
  forecastLoaded: boolean;
  activeMapLayer: MapOutlookLayer;
  selectedDay: DayType;
  availableDays: DayType[];
  reports: StormReport[];
  selectedReportId: string | null;
  activeComponent: ComponentKey | null;
  result: PackageGrade | null;
  reportsVisible: boolean;
  onSelectMapLayer: (layer: MapOutlookLayer) => void;
  onSelectDay: (day: never) => void;
  onToggleEvidence: () => void;
  onSelectReportId?: (reportId: string | null) => void;
  mapPaneRef: React.RefObject<HTMLDivElement | null>;
  mapRef: React.RefObject<VerificationMapHandle | null>;
}

const ForecastGradeMapPane: React.FC<ForecastGradeMapPaneProps> = ({
  forecastLoaded,
  activeMapLayer,
  selectedDay,
  availableDays,
  reports,
  selectedReportId,
  activeComponent,
  result,
  reportsVisible,
  onSelectMapLayer,
  onSelectDay,
  onToggleEvidence,
  onSelectReportId,
  mapPaneRef,
  mapRef,
}) => {
  useEffect(() => {
    if (!selectedReportId) {
      return;
    }
    const report = reports.find((entry) => entry.id === selectedReportId);
    const map = mapRef.current?.getMap();
    if (!report || !map) {
      return;
    }
    map.getView().animate({
      center: fromLonLat([report.longitude, report.latitude]),
      duration: 250,
    });
  }, [mapRef, reports, selectedReportId]);

  return (
    <div className="fg-map-pane" ref={mapPaneRef} data-emphasis-component={activeComponent ?? undefined}>
      {forecastLoaded ? (
        <>
          <VerificationMap
            ref={mapRef}
            activeOutlookType={activeMapLayer}
            selectedDay={selectedDay}
            highlightedReportId={selectedReportId}
            emphasisComponent={activeComponent}
            onSelectReportId={onSelectReportId}
          />
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
};

export default ForecastGradeMapPane;
