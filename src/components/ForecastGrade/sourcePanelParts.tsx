import React, { useRef } from 'react';
import { FileUp } from 'lucide-react';
import type { GradeAccountTier, PackageSourceKind } from '../../types/forecastGrade';

interface PackageChooserProps {
  availableSources: PackageSourceKind[];
  onFile: (file: File) => void;
  renderCloudSource?: () => React.ReactNode;
}

export const PackageChooser: React.FC<PackageChooserProps> = ({ availableSources, onFile, renderCloudSource }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showCloud = availableSources.includes('cloud') && Boolean(renderCloudSource);

  return (
    <div className="mt-2 space-y-3">
      <div>
        <label className="fg-touch inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300/50 px-3 py-2 text-sm">
          <FileUp className="h-4 w-4" />
          <span>Upload forecast file</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onFile(file);
              }
              event.target.value = '';
            }}
          />
        </label>
        <p className="mt-1 text-xs text-slate-400">A .json package exported from the Outlook Creator.</p>
      </div>
      {showCloud && <div className="border-t border-slate-200/30 pt-3">{renderCloudSource?.()}</div>}
    </div>
  );
};

interface ReportDatePickerProps {
  useToday: boolean;
  reportDate: string;
  onUseTodayChange: (value: boolean) => void;
  onReportDateChange: (value: string) => void;
}

export const ReportDatePicker: React.FC<ReportDatePickerProps> = ({
  useToday,
  reportDate,
  onUseTodayChange,
  onReportDateChange,
}) => (
  <div className="fg-report-date">
    <div>
      <div className="fg-panel-eyebrow">2 · Observation date</div>
      <div className="text-sm font-semibold">SPC storm reports</div>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
      <label className="fg-touch inline-flex items-center gap-2 px-2">
        <input type="checkbox" checked={useToday} onChange={(event) => onUseTodayChange(event.target.checked)} />
        Use today instead
      </label>
      {!useToday && (
        <input
          type="date"
          className="fg-touch rounded border border-slate-300/40 bg-transparent px-2 py-1"
          value={reportDate}
          onChange={(event) => onReportDateChange(event.target.value)}
          aria-label="Report date"
        />
      )}
    </div>
  </div>
);

interface GradeRunFooterProps {
  tier: GradeAccountTier;
  canRun: boolean;
  isRunning: boolean;
  error: string | null;
  onRun: () => void;
}

export const GradeRunFooter: React.FC<GradeRunFooterProps> = ({ tier, canRun, isRunning, error, onRun }) => (
  <div className="fg-grade-footer" aria-live="polite">
    <div className={`fg-run-status ${error ? 'fg-run-status--error' : ''}`}>
      {error ? 'Grading needs attention — update the date or retry.' : canRun ? '1 of 1 package ready to grade' : 'Choose a reached SPC report date to grade'}
    </div>
    {error && <p className="fg-grade-error">{error}</p>}
    <button
      type="button"
      className="fg-touch fg-grade-button"
      disabled={!canRun}
      onClick={onRun}
    >
      {isRunning ? 'Grading forecast…' : error ? 'Retry grading' : 'Grade forecast'}
    </button>
    {tier === 'signed-out' && (
      <p className="fg-grade-note">Sign in to keep a grade history trend.</p>
    )}
  </div>
);
