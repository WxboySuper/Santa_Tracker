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
  <div className="mt-4 border-t border-slate-200/30 pt-3">
    <div className="text-sm font-semibold">SPC storm reports</div>
    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
      <label className="inline-flex items-center gap-2">
        <input type="checkbox" checked={useToday} onChange={(event) => onUseTodayChange(event.target.checked)} />
        Today
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
  <>
    {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    <button
      type="button"
      className="fg-touch mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!canRun}
      onClick={onRun}
    >
      {isRunning ? 'Grading…' : 'Grade forecast'}
    </button>
    {tier === 'signed-out' && (
      <p className="mt-2 text-xs text-slate-400">Sign in to keep a grade history trend.</p>
    )}
  </>
);
