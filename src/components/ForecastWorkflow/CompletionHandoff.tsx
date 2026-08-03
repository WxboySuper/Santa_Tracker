import React from 'react';
import './CompletionHandoff.css';

interface CompletionHandoffProps {
  open: boolean;
  showMonitor: boolean;
  isDownloading: boolean;
  onWorkflowExport: () => void;
  onCycleExport: () => void;
  onMonitor: () => void;
  onReturnToMap: () => void;
  onDismiss: () => void;
}

/** Offers useful next steps after a workflow is completed without changing completion state. */
export const CompletionHandoff: React.FC<CompletionHandoffProps> = ({
  open,
  showMonitor,
  isDownloading,
  onWorkflowExport,
  onCycleExport,
  onMonitor,
  onReturnToMap,
  onDismiss,
}) => {
  if (!open) return null;
  return (
    <div className="completion-handoff" role="dialog" aria-modal="true" aria-labelledby="completion-handoff-title" aria-describedby="completion-handoff-description">
      <div>
        <h2 id="completion-handoff-title">Workflow complete</h2>
        <p id="completion-handoff-description">
          Your review is saved. Choose what you want to do next, or return to the map.
        </p>
      </div>
      <div className="completion-handoff__actions">
        <button type="button" onClick={onWorkflowExport} disabled={isDownloading}>Export workflow package</button>
        <button type="button" onClick={onCycleExport} disabled={isDownloading}>Export complete cycle</button>
        {showMonitor ? (
          <button type="button" onClick={onMonitor}>Open Monitor</button>
        ) : null}
        <button type="button" onClick={onReturnToMap}>Return to map</button>
      </div>
      <div>
        <button type="button" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
};

export default CompletionHandoff;
