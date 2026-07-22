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
  <div className="rounded-xl border border-slate-300/40 p-4">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold">Choose a package</h3>
      {hasForecast && (
        <button type="button" className="text-xs text-blue-500 hover:underline" onClick={onReset}>
          Change source
        </button>
      )}
    </div>

    {hasForecast ? (
      <p className="mt-2 text-sm text-slate-500">
        <span className="font-medium text-slate-600">Loaded:</span> {sourceLabel}
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
  </div>
);

export default SourcePanel;
