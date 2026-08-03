import React from 'react';
import type { SavedCycle } from '../../store/forecastSlice';
import type { ForecastCycle } from '../../types/outlooks';
import ConfirmationModal from '../DrawingTools/ConfirmationModal';
import CycleHistoryModalPanel from './CycleHistoryModalPanel';

interface CycleHistoryConfirmAction {
  title: string;
  message: string;
  onConfirm: () => void;
}

interface CycleHistoryModalDialogProps {
  modalRef: React.RefObject<HTMLDivElement | null>;
  currentCycle: ForecastCycle;
  savedCycles: SavedCycle[];
  showSaveForm: boolean;
  newLabel: string;
  confirmAction: CycleHistoryConfirmAction | null;
  onClose: () => void;
  onOpenSaveForm: () => void;
  onNewLabelChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveCurrent: () => void;
  onCancelSaveForm: () => void;
  onLoadClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDeleteClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onCancelConfirm: () => void;
}

/** Portaled cycle history shell, dialog content, and stacked confirm overlay. */
const CycleHistoryModalDialog: React.FC<CycleHistoryModalDialogProps> = ({
  confirmAction,
  onCancelConfirm,
  onClose,
  ...panelProps
}) => (
  <div className="history-modal-root notranslate">
    {/* skipcq: JS-0415 */}
    <div className="history-modal-overlay" onClick={onClose} aria-hidden="true" />
    <CycleHistoryModalPanel onClose={onClose} {...panelProps} />
    {confirmAction ? (
      <ConfirmationModal
        isOpen
        title={confirmAction.title}
        message={confirmAction.message}
        onConfirm={confirmAction.onConfirm}
        onCancel={onCancelConfirm}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        overlayClassName="export-modal-overlay--stacked"
      />
    ) : null}
  </div>
);

export default CycleHistoryModalDialog;
export type { CycleHistoryConfirmAction };
