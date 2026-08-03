import React from 'react';
import type { SavedCycle } from '../../store/forecastSlice';
import type { ForecastCycle } from '../../types/outlooks';
import CycleHistoryCurrentSection from './CycleHistoryCurrentSection';
import CycleHistorySavedList from './CycleHistorySavedList';

interface CycleHistoryModalPanelProps {
  modalRef: React.RefObject<HTMLDivElement | null>;
  currentCycle: ForecastCycle;
  savedCycles: SavedCycle[];
  showSaveForm: boolean;
  newLabel: string;
  onClose: () => void;
  onOpenSaveForm: () => void;
  onNewLabelChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveCurrent: () => void;
  onCancelSaveForm: () => void;
  onLoadClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDeleteClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/** Renders the dialog panel content for the cycle history modal. */
const CycleHistoryModalPanel: React.FC<CycleHistoryModalPanelProps> = ({
  modalRef,
  currentCycle,
  savedCycles,
  showSaveForm,
  newLabel,
  onClose,
  onOpenSaveForm,
  onNewLabelChange,
  onSaveCurrent,
  onCancelSaveForm,
  onLoadClick,
  onDeleteClick,
}) => (
  <div
    className="history-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="cycle-history-title"
    ref={modalRef}
    onClick={(event) => event.stopPropagation()}
  >
    <div className="history-modal-header">
      <h2 id="cycle-history-title">Forecast Cycle History</h2>
      <button className="history-modal-close" onClick={onClose} aria-label="Close cycle history modal">
        ✕
      </button>
    </div>

    <div className="history-modal-body">
      <CycleHistoryCurrentSection
        currentCycle={currentCycle}
        showSaveForm={showSaveForm}
        newLabel={newLabel}
        onOpenSaveForm={onOpenSaveForm}
        onNewLabelChange={onNewLabelChange}
        onSaveCurrent={onSaveCurrent}
        onCancelSaveForm={onCancelSaveForm}
      />

      <CycleHistorySavedList
        savedCycles={savedCycles}
        onLoadClick={onLoadClick}
        onDeleteClick={onDeleteClick}
      />
    </div>

    <div className="history-modal-footer">
      <div className="history-footer-info">
        💡 Use Copy from Previous to reference older outlooks when creating new forecasts
      </div>
      <button className="history-btn-close" onClick={onClose}>
        Close
      </button>
    </div>
  </div>
);

export default CycleHistoryModalPanel;
