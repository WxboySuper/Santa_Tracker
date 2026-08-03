import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import CycleHistoryModal from '../CycleManager/CycleHistoryModal';
import CopyFromPreviousModal from '../CycleManager/CopyFromPreviousModal';
import ExportModal from '../DrawingTools/ExportModal';
import CompletionValidationModal from '../CompletionValidation/CompletionValidationModal';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { ForecastWorkspaceController } from './useForecastWorkspaceController';

/** Confirmation dialog for the destructive "reset all drawings" action. */
const ResetConfirmDialog: React.FC<{
  open: boolean;
  onCancel: () => void;
  onReset: () => void;
}> = ({ open, onCancel, onReset }) => (
  <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Reset All Drawings?</DialogTitle>
        <DialogDescription>This will clear all outlook polygons for all days. This action cannot be undone.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button variant="destructive" onClick={onReset}>Reset All</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/** Shared hidden file input plus modals used by every Forecast workspace layout. */
export const ForecastWorkspaceModals: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => {
  const completionValidationResult = useSelector(
    (state: RootState) => state.forecast.completionValidation.lastResult
  );

  return (
    <>
      <input
        ref={controller.fileInputRef as unknown as React.Ref<HTMLInputElement>}
        type="file"
        accept=".json"
        onChange={controller.onFileSelect}
        className="hidden"
      />
      <CycleHistoryModal isOpen={controller.showHistoryModal} onClose={controller.onCloseHistoryModal} />
      <CopyFromPreviousModal isOpen={controller.showCopyModal} onClose={controller.onCloseCopyModal} />
      <ExportModal
        isOpen={controller.isExportModalOpen}
        onConfirm={controller.onConfirmExport}
        onCancel={controller.onCancelExport}
      />
      <ResetConfirmDialog
        open={controller.showResetConfirm}
        onCancel={controller.onCancelReset}
        onReset={controller.onReset}
      />
      <CompletionValidationModal
        isOpen={controller.showCompletionModal}
        validationResult={completionValidationResult}
        omittedDays={controller.omittedDays}
        onClose={controller.onCloseCompletionModal}
        onComplete={controller.onCompleteCycle}
        onCompleteWithOmissions={controller.onCompleteWithOmissions}
        onOmitDay={controller.onOmitDay}
        onNavigateToIssue={controller.onNavigateToIssue}
        onExport={controller.onInitiateExport}
      />
    </>
  );
};

export default ForecastWorkspaceModals;
