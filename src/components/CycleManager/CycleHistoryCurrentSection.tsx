import React from 'react';
import type { ForecastCycle } from '../../types/outlooks';

interface CycleHistoryCurrentSectionProps {
  currentCycle: ForecastCycle;
  showSaveForm: boolean;
  newLabel: string;
  onOpenSaveForm: () => void;
  onNewLabelChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveCurrent: () => void;
  onCancelSaveForm: () => void;
}

/** Renders the current-cycle summary and save form. */
const CycleHistoryCurrentSection: React.FC<CycleHistoryCurrentSectionProps> = ({
  currentCycle,
  showSaveForm,
  newLabel,
  onOpenSaveForm,
  onNewLabelChange,
  onSaveCurrent,
  onCancelSaveForm,
}) => (
  <div className="history-current-section">
    <h3>Current Cycle</h3>
    <div className="history-current-info">
      <strong>Date:</strong> {new Date(currentCycle.cycleDate).toLocaleDateString()}
      <br />
      <strong>Active Day:</strong> Day {currentCycle.currentDay}
      <br />
      <strong>Days with data:</strong> {Object.keys(currentCycle.days).length}
    </div>

    {!showSaveForm ? (
      <button className="history-btn-save-current" onClick={onOpenSaveForm}>
        💾 Save Current Cycle
      </button>
    ) : (
      <div className="history-save-form">
        <input
          type="text"
          placeholder="Optional label (e.g. Morning, Afternoon, 00Z)"
          value={newLabel}
          onChange={onNewLabelChange}
          className="history-label-input"
          maxLength={50}
        />
        <div className="history-save-form-buttons">
          <button className="history-btn-save-confirm" onClick={onSaveCurrent}>
            Save
          </button>
          <button className="history-btn-save-cancel" onClick={onCancelSaveForm}>
            Cancel
          </button>
        </div>
      </div>
    )}
  </div>
);

export default CycleHistoryCurrentSection;
