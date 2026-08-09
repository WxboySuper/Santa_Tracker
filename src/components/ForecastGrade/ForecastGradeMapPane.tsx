import React, { useEffect, useState } from 'react';
import { fromLonLat } from 'ol/proj';
import VerificationMap, { type VerificationMapHandle } from '../Map/VerificationMap';
import type { StormReport } from '../../types/stormReports';
import type { DatEvidence } from '../../utils/dat';
import type { DayType } from '../../types/outlooks';
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
  datEvidence: DatEvidence | null;
  datVisible: boolean;
  onSelectMapLayer: (layer: MapOutlookLayer) => void;
  onSelectDay: (day: DayType) => void;
  onToggleEvidence: () => void;
  onToggleDat: () => void;
  mapPaneRef: React.RefObject<HTMLDivElement | null>;
  mapRef: React.RefObject<VerificationMapHandle | null>;
}

/** Renders the verification map, its controls, and grading overlays. */
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
  datEvidence,
  datVisible,
  onSelectMapLayer,
  onSelectDay,
  onToggleEvidence,
  onToggleDat,
  mapPaneRef,
  mapRef,
}) => {
  const [legendOpen, setLegendOpen] = useState(false);
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
    <div className="fg-map-region">
      <div className="fg-map-toolbar">
        <ForecastGradeMapControls
          activeMapLayer={activeMapLayer}
          onSelectMapLayer={onSelectMapLayer}
          availableDays={availableDays}
          selectedDay={selectedDay}
          onSelectDay={onSelectDay}
          reportsVisible={reportsVisible}
          onToggleEvidence={onToggleEvidence}
          datVisible={datVisible}
          onToggleDat={onToggleDat}
          legendOpen={legendOpen}
          onToggleLegend={() => setLegendOpen((open) => !open)}
        />
      </div>
      <div className="fg-map-pane" ref={mapPaneRef} data-emphasis-component={activeComponent ?? undefined}>
      <div className="fg-map-canvas">
        {forecastLoaded ? (
          <>
          <VerificationMap
            ref={mapRef}
            activeOutlookType={activeMapLayer}
            selectedDay={selectedDay}
            legendOpen={legendOpen}
            datEvidence={datEvidence}
            datVisible={datVisible}
          />
          <div className="fg-map-telemetry" aria-hidden="true">
            <span>SPC / EVIDENCE</span>
            <span>DAY {selectedDay}</span>
            <span>{reports.length} REPORTS</span>
            <span>{datEvidence?.damagePoints.length ?? 0} DAT</span>
          </div>
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
          <div className="fg-map-empty">
          <span className="fg-map-empty__eyebrow">Evidence surface</span>
          <strong>Load a forecast package to begin.</strong>
          <p>The map will show your outlook and the SPC storm reports used to score it.</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default ForecastGradeMapPane;
