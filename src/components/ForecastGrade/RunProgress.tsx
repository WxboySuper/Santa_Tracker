import React from 'react';
import type { GradeProgress } from '../../utils/verificationV2';

interface RunProgressProps {
  progress: GradeProgress | null;
}

/**
 * Staged foreground progress. Accuracy is prioritized over a fixed latency
 * budget; long runs surface their stage and complete automatically.
 */
const RunProgress: React.FC<RunProgressProps> = ({ progress }) => {
  if (!progress) {
    return null;
  }
  const percent = Math.round(progress.fraction * 100);
  return (
    <div className="rounded-xl border border-slate-300/40 p-4" role="status" aria-live="polite">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span>{progress.label}</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-300/30">
        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};

export default RunProgress;
