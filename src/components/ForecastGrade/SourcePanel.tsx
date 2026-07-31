import React from 'react';
import type { GradeAccountTier, PackageSourceKind } from '../../types/forecastGrade';
import { GradeRunFooter, PackageChooser, ReportDatePicker } from './sourcePanelParts';

interface SourcePanelProps {
  tier: GradeAccountTier;
  availableSources: PackageSourceKind[];
  hasForecast: boolean;
  sourceLabel: string;
  useToday: boolean;
  reportDate: string;
  canRun: boolean;
  isRunning: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onUseTodayChange: (value: boolean) => void;
  onReportDateChange: (value: string) => void;
  onRun: () => void;
  onReset: () => void;
  renderCloudSource?: () => React.ReactNode;
}

/**
 * Capability-first, explicit source picker. Signed-out sees the minimal file +
 * SPC path; premium additionally gets the cloud package source. There is no
 * automatic handoff from the Forecast Editor — the source is always chosen here.
 */
const SourcePanel: React.FC<SourcePanelProps> = ({
  tier,
  availableSources,
  hasForecast,
  sourceLabel,
  useToday,
  reportDate,
  canRun,
  isRunning,
  error,
  onFile,
  onUseTodayChange,
  onReportDateChange,
  onRun,
  onReset,
  renderCloudSource,
}) => (
  <section className="fg-source-panel" aria-label="Forecast package and storm report source">
    <div className="fg-source-panel__heading">
      <div>
        <span className="fg-panel-eyebrow">1 · Package and evidence</span>
        <h3>Choose a forecast package</h3>
      </div>
      {hasForecast && (
        <button type="button" className="text-xs text-blue-500 hover:underline" onClick={onReset}>
          Change source
        </button>
      )}
    </div>

    <div className="fg-metric-strip" aria-label="Verification package status">
      <span><b>PACKAGE</b>{hasForecast ? ' READY' : ' AWAITING INPUT'}</span>
      <span><b>ENGINE</b> GFC-VER-1</span>
      <span><b>DATE</b> {useToday ? 'TODAY' : reportDate || 'UNSET'}</span>
    </div>

    {hasForecast ? (
      <p className="fg-loaded-package">
        <span>Loaded</span> {sourceLabel}
      </p>
    ) : (
      <PackageChooser availableSources={availableSources} onFile={onFile} renderCloudSource={renderCloudSource} />
    )}

    <ReportDatePicker
      useToday={useToday}
      reportDate={reportDate}
      onUseTodayChange={onUseTodayChange}
      onReportDateChange={onReportDateChange}
    />

    <GradeRunFooter tier={tier} canRun={canRun} isRunning={isRunning} error={error} onRun={onRun} />
  </section>
);

export default SourcePanel;
