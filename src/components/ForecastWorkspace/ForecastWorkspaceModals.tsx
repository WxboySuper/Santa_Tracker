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
import ForecastTransferModal from './ForecastTransferModal';
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

/** Shared modals used by every Forecast workspace layout. */
export const ForecastWorkspaceModals: React.FC<{
  controller: ForecastWorkspaceController;
  onTransferError?: (message: string) => void;
}> = ({ controller, onTransferError }) => {
  const completionValidationResult = useSelector(
    (state: RootState) => state.forecast.completionValidation.lastResult
  );

  return (
    <>
      <CycleHistoryModal isOpen={controller.showHistoryModal} onClose={controller.onCloseHistoryModal} />
      <CopyFromPreviousModal isOpen={controller.showCopyModal} onClose={controller.onCloseCopyModal} />
      <ExportModal
        isOpen={controller.isExportModalOpen}
        onConfirm={controller.onConfirmExport}
        onCancel={controller.onCancelExport}
      />
      <ForecastTransferModal
        open={controller.showTransferModal}
        direction={controller.transferDirection}
        onDirectionChange={controller.onTransferDirectionChange}
        onClose={controller.onCloseTransferModal}
        forecastCycle={controller.forecastCycle}
        mapView={controller.getMapView()}
        cycleMetadata={controller.cycleMetadata}
        isWorkflowActive={controller.isWorkflowActive}
        isBusy={controller.isTransferBusy}
        onBusyChange={controller.onTransferBusyChange}
        onImported={controller.onTransferImported}
        onExported={controller.onTransferExported}
        onError={onTransferError}
        onExportImage={controller.onInitiateExport}
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
