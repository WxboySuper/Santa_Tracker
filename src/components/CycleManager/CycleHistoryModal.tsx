import React, { useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectSavedCycles,
  selectForecastCycle,
  saveCurrentCycle,
  loadSavedCycle,
  deleteSavedCycle,
} from '../../store/forecastSlice';
import { useAppLayout } from '../Layout/AppLayout';
import ModalPortal from '../ui/ModalPortal';
import './CycleHistoryModal.css';
import CycleHistoryModalDialog, { type CycleHistoryConfirmAction } from './CycleHistoryModalDialog';
import { deferCloseAfterConfirm } from './cycleHistoryModalUtils';
import { useCycleHistoryModalKeyboard } from './useCycleHistoryModalKeyboard';

interface CycleHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export { deferCloseAfterConfirm } from './cycleHistoryModalUtils';

/** Modal for browsing, saving, loading, and deleting saved forecast cycles. */
const CycleHistoryModal: React.FC<CycleHistoryModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const { addToast } = useAppLayout();
  const savedCycles = useSelector(selectSavedCycles);
  const currentCycle = useSelector(selectForecastCycle);

  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const [confirmAction, setConfirmAction] = useState<CycleHistoryConfirmAction | null>(null);

  /** Dismisses the nested confirmation dialog without acting. */
  function handleDismissConfirm(): void {
    setConfirmAction(null);
  }

  useCycleHistoryModalKeyboard({
    isOpen,
    modalRef,
    confirmAction,
    onClose,
    onDismissConfirm: handleDismissConfirm,
  });

  if (!isOpen) return null;

  /** Persists the current forecast cycle with an optional label. */
  function handleSaveCurrent(): void {
    dispatch(saveCurrentCycle({ label: newLabel.trim() || undefined }));
    setNewLabel('');
    setShowSaveForm(false);
    addToast('Cycle saved successfully!', 'success');
  }

  /** Prompts before replacing the active cycle with a saved one. */
  function handleLoadCycle(cycleId: string): void {
    setConfirmAction({
      title: 'Load Cycle',
      message: 'Load this cycle? Unsaved changes to your current cycle will be lost.',
      onConfirm: () => {
        dispatch(loadSavedCycle(cycleId));
        addToast('Cycle loaded!', 'success');
        setConfirmAction(null);
        deferCloseAfterConfirm(onClose);
      },
    });
  }

  /** Prompts before deleting a saved cycle permanently. */
  function handleDeleteCycle(cycleId: string): void {
    setConfirmAction({
      title: 'Delete Cycle',
      message: 'Delete this saved cycle permanently?',
      onConfirm: () => {
        dispatch(deleteSavedCycle(cycleId));
        setConfirmAction(null);
      },
    });
  }

  /** Opens the load-cycle confirmation dialog for the clicked saved cycle. */
  function handleCycleLoadClick(event: React.MouseEvent<HTMLButtonElement>): void {
    const cycleId = event.currentTarget.dataset.cycleId;
    if (!cycleId) {
      return;
    }

    handleLoadCycle(cycleId);
  }

  /** Opens the delete-cycle confirmation dialog for the clicked saved cycle. */
  function handleCycleDeleteClick(event: React.MouseEvent<HTMLButtonElement>): void {
    const cycleId = event.currentTarget.dataset.cycleId;
    if (!cycleId) {
      return;
    }

    handleDeleteCycle(cycleId);
  }

  /** Reveals the optional-label save form. */
  function handleOpenSaveForm(): void {
    setShowSaveForm(true);
  }

  /** Updates the optional label for the cycle being saved. */
  function handleNewLabelChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setNewLabel(event.target.value);
  }

  /** Hides the save form and clears the draft label. */
  function handleCancelSaveForm(): void {
    setShowSaveForm(false);
    setNewLabel('');
  }

  return (
    <ModalPortal>
      {/* skipcq: JS-0415 */}
      <CycleHistoryModalDialog
        modalRef={modalRef}
        currentCycle={currentCycle}
        savedCycles={savedCycles}
        showSaveForm={showSaveForm}
        newLabel={newLabel}
        confirmAction={confirmAction}
        onClose={onClose}
        onOpenSaveForm={handleOpenSaveForm}
        onNewLabelChange={handleNewLabelChange}
        onSaveCurrent={handleSaveCurrent}
        onCancelSaveForm={handleCancelSaveForm}
        onLoadClick={handleCycleLoadClick}
        onDeleteClick={handleCycleDeleteClick}
        onCancelConfirm={handleDismissConfirm}
      />
    </ModalPortal>
  );
};

export default CycleHistoryModal;
