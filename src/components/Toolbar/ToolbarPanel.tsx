import React, { useRef, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  Save, 
  Upload, 
  History, 
  Copy, 
  Image as ImageIcon, 
  Trash2,
  Menu
} from 'lucide-react';
import { FloatingPanel } from '../Layout';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { RootState } from '../../store';
import { resetForecasts, selectCurrentOutlooks } from '../../store/forecastSlice';
import { isExportMapExposed } from '../../config/productExposureSelectors';
import { ForecastMapHandle } from '../Map/ForecastMap';
import CycleHistoryModal from '../CycleManager/CycleHistoryModal';
import CopyFromPreviousModal from '../CycleManager/CopyFromPreviousModal';
import ExportModal from '../DrawingTools/ExportModal';
import { useExportMap } from '../DrawingTools/useExportMap';
import type { AddToastFn } from '../Layout';

interface ToolbarPanelProps {
  onSave: () => void;
  onLoad: (file: File) => void;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  addToast: AddToastFn;
}

interface ToolbarActionsProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isSaved: boolean;
  onSave: () => void;
  onLoadClick: () => void;
  onOpenHistoryModal: () => void;
  onOpenCopyModal: () => void;
  onInitiateExport: () => void;
  onOpenResetConfirm: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// Component for the toolbar actions panel, which includes buttons for saving/loading forecasts, viewing cycle history, copying from previous cycles, exporting images, and resetting all data. It uses a floating panel to display the actions and manages the state for opening modals related to these actions. The component also includes a hidden file input for loading forecast data from a JSON file, which is triggered by the "Load from JSON" button.
const ToolbarActions: React.FC<ToolbarActionsProps> = ({
  fileInputRef,
  isSaved,
  onSave,
  onLoadClick,
  onOpenHistoryModal,
  onOpenCopyModal,
  onInitiateExport,
  onOpenResetConfirm,
  onFileSelect,
}) => (
  <FloatingPanel
    title="Tools"
    position="bottom-left"
    icon={<Menu className="h-4 w-4" />}
    minWidth={220}
  >
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start"
        onClick={onSave}
        disabled={isSaved}
      >
        <Save className="h-4 w-4 mr-2" />
        Save to JSON
        <span className="ml-auto text-xs text-muted-foreground">⌃S</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start"
        onClick={onLoadClick}
      >
        <Upload className="h-4 w-4 mr-2" />
        Load from JSON
      </Button>

      <hr className="border-border my-0.5" />

      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start"
        onClick={onOpenHistoryModal}
      >
        <History className="h-4 w-4 mr-2" />
        Cycle History
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start"
        onClick={onOpenCopyModal}
      >
        <Copy className="h-4 w-4 mr-2" />
        Copy from Previous
      </Button>

      <hr className="border-border my-0.5" />

      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start"
        onClick={onInitiateExport}
      >
        <ImageIcon className="h-4 w-4 mr-2" />
        Export Image
      </Button>

      <Button
        variant="destructive"
        size="sm"
        className="w-full justify-start"
        onClick={onOpenResetConfirm}
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Reset All
      </Button>
    </div>

    <input
      ref={fileInputRef}
      type="file"
      accept=".json"
      onChange={onFileSelect}
      className="hidden"
    />
  </FloatingPanel>
);

/** Confirmation dialog for the destructive "reset all drawings" action. */
const ResetConfirmDialog: React.FC<{
  open: boolean;
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
  onCancel: () => void;
  onReset: () => void;
}> = ({ open, onOpenChange, onCancel, onReset }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Reset All Drawings?</DialogTitle>
        <DialogDescription>
          This will clear all outlook polygons for all days. This action cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button variant="destructive" onClick={onReset}>Reset All</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

interface ToolbarModalsProps {
  showHistoryModal: boolean;
  showCopyModal: boolean;
  showResetConfirm: boolean;
  setShowResetConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  isModalOpen: boolean;
  onCloseHistoryModal: () => void;
  onCloseCopyModal: () => void;
  onConfirmExport: (title: string) => Promise<void>;
  onCancelExport: () => void;
  onCancelReset: () => void;
  onReset: () => void;
}

// Component for managing the various modals related to the toolbar actions, including the cycle history modal, copy from previous modal, export modal, and reset confirmation dialog. It receives props to control the visibility of each modal and handlers for confirming or canceling actions within those modals. This component is responsible for rendering the appropriate modal based on the current state and ensuring that the correct handlers are called when users interact with the modals.
const ToolbarModals: React.FC<ToolbarModalsProps> = ({
  showHistoryModal,
  showCopyModal,
  showResetConfirm,
  setShowResetConfirm,
  isModalOpen,
  onCloseHistoryModal,
  onCloseCopyModal,
  onConfirmExport,
  onCancelExport,
  onCancelReset,
  onReset,
}) => (
  <>
    <CycleHistoryModal
      isOpen={showHistoryModal}
      onClose={onCloseHistoryModal}
    />

    <CopyFromPreviousModal
      isOpen={showCopyModal}
      onClose={onCloseCopyModal}
    />

    <ExportModal
      isOpen={isModalOpen}
      onConfirm={onConfirmExport}
      onCancel={onCancelExport}
    />

    <ResetConfirmDialog open={showResetConfirm} onOpenChange={setShowResetConfirm} onCancel={onCancelReset} onReset={onReset} />
  </>
);

// Main component for the toolbar panel, which integrates the toolbar actions and modals. It manages the state for showing/hiding the various modals and handles the interactions for saving/loading forecasts, viewing cycle history, copying from previous cycles, exporting images, and resetting all data. The component also connects to the Redux store to access the current state of forecasts and outlooks, and it uses a custom hook for handling the export functionality.
export const ToolbarPanel: React.FC<ToolbarPanelProps> = ({
  onSave,
  onLoad,
  mapRef,
  addToast,
}) => {
  const dispatch = useDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const isSaved = useSelector((state: RootState) => state.forecast.isSaved);
  const outlooks = useSelector(selectCurrentOutlooks);
  const isExportDisabled = !isExportMapExposed();

  // Export hook
  const { isModalOpen, initiateExport, confirmExport, cancelExport } = useExportMap({
    mapRef,
    outlooks,
    isExportDisabled,
    addToast,
  });

  // Handler for file selection when loading a forecast from JSON, which reads the selected file and passes it to the onLoad prop function. It also resets the file input value after handling the file to allow for loading the same file again if needed.
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoad(file);
    }
    // Reset the input so the same file can be loaded again
    e.target.value = '';
  }, [onLoad]);

  // Handler for the "Load from JSON" button click, which triggers the hidden file input to open the file selection dialog. This allows users to select a JSON file containing forecast data to load into the app.
  const handleLoadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handler for resetting all forecasts, which dispatches the resetForecasts action to clear all forecast data from the Redux store. It also closes the reset confirmation dialog and shows a toast notification to inform the user that all drawings have been reset.
  const handleReset = useCallback(() => {
    dispatch(resetForecasts());
    setShowResetConfirm(false);
    addToast('All drawings reset', 'info');
  }, [dispatch, addToast]);

  // Handlers to open modals
  const handleOpenHistoryModal = useCallback(() => {
    setShowHistoryModal(true);
  }, []);

  // Note: The "Copy from Previous" modal is only relevant if there is a previous cycle to copy from. In a real implementation, you might want to check if that data exists before allowing the modal to open, and show a toast or disable the button if not.
  const handleOpenCopyModal = useCallback(() => {
    setShowCopyModal(true);
  }, []);

  // Handler to open reset confirmation dialog
  const handleOpenResetConfirm = useCallback(() => {
    setShowResetConfirm(true);
  }, []);

  // Handlers to close modals
  const handleCloseHistoryModal = useCallback(() => {
    setShowHistoryModal(false);
  }, []);

  // Note: The "Copy from Previous" modal is only relevant if there is a previous cycle to copy from. In a real implementation, you might want to check if that data exists before allowing the modal to open, and show a toast or disable the button if not.
  const handleCloseCopyModal = useCallback(() => {
    setShowCopyModal(false);
  }, []);

  // Handler to cancel reset action (just closes the confirmation dialog)
  const handleCancelReset = useCallback(() => {
    setShowResetConfirm(false);
  }, []);

  return (
    <>
      <ToolbarActions
        fileInputRef={fileInputRef}
        isSaved={isSaved}
        onSave={onSave}
        onLoadClick={handleLoadClick}
        onOpenHistoryModal={handleOpenHistoryModal}
        onOpenCopyModal={handleOpenCopyModal}
        onInitiateExport={initiateExport}
        onOpenResetConfirm={handleOpenResetConfirm}
        onFileSelect={handleFileSelect}
      />

      <ToolbarModals
        showHistoryModal={showHistoryModal}
        showCopyModal={showCopyModal}
        showResetConfirm={showResetConfirm}
        setShowResetConfirm={setShowResetConfirm}
        isModalOpen={isModalOpen}
        onCloseHistoryModal={handleCloseHistoryModal}
        onCloseCopyModal={handleCloseCopyModal}
        onConfirmExport={confirmExport}
        onCancelExport={cancelExport}
        onCancelReset={handleCancelReset}
        onReset={handleReset}
      />
    </>
  );
};

export default ToolbarPanel;
