import React from 'react';
import './ConfirmationModal.css';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional overlay class for stacking above other modals (e.g. cycle history). */
  overlayClassName?: string;
}

/** Renders a confirmation dialog, optionally stacked above another modal. */
const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  overlayClassName,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onCancel();
    }}>
      <DialogContent
        className="confirmation-dialog"
        overlayClassName={overlayClassName}
        aria-describedby="confirm-desc"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription id="confirm-desc">{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmationModal;
