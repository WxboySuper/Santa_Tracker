import React, { useCallback, useEffect } from 'react';

/** Returns focusable controls inside the modal dialog root. */
const getFocusableElements = (root: HTMLElement | null): HTMLElement[] => {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  );
};

/** Wraps Tab and Shift+Tab so focus stays inside the modal. */
const handleTabNavigation = (event: KeyboardEvent, root: HTMLElement | null): void => {
  if (!root) return;
  const focusable = getFocusableElements(root);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const isFirstActive = document.activeElement === first;
  const isLastActive = document.activeElement === last;

  if (event.shiftKey && isFirstActive) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && isLastActive) {
    event.preventDefault();
    first.focus();
  }
};

/** Handles Escape for the history modal or its nested confirm dialog. */
const handleEscapeKey = (
  event: KeyboardEvent,
  confirmAction: unknown,
  onDismissConfirm: () => void,
  onClose: () => void,
): boolean => {
  if (event.key !== 'Escape') {
    return false;
  }

  if (confirmAction) {
    onDismissConfirm();
  } else {
    onClose();
  }

  return true;
};

/** Traps Tab navigation while the history modal is active and no confirm is open. */
const handleModalTabKey = (
  event: KeyboardEvent,
  modalRef: React.RefObject<HTMLDivElement | null>,
  confirmAction: unknown,
): void => {
  if (event.key !== 'Tab') {
    return;
  }

  if (confirmAction) {
    return;
  }

  const root = modalRef.current;
  if (!root) {
    return;
  }

  handleTabNavigation(event, root);
};

interface UseCycleHistoryModalKeyboardOptions {
  isOpen: boolean;
  modalRef: React.RefObject<HTMLDivElement | null>;
  confirmAction: unknown;
  onClose: () => void;
  onDismissConfirm: () => void;
}

/** Installs Escape/Tab keyboard handling and initial focus while the modal is open. */
export const useCycleHistoryModalKeyboard = ({
  isOpen,
  modalRef,
  confirmAction,
  onClose,
  onDismissConfirm,
}: UseCycleHistoryModalKeyboardOptions): void => {
  const handleModalKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (handleEscapeKey(event, confirmAction, onDismissConfirm, onClose)) {
        return;
      }

      handleModalTabKey(event, modalRef, confirmAction);
    },
    [confirmAction, modalRef, onClose, onDismissConfirm],
  );

  useEffect(() => {
    if (!isOpen) return;

    /** Focuses the first tabbable control when the modal opens. */
    const syncFocus = () => {
      if (!modalRef.current) return;
      const focusable = getFocusableElements(modalRef.current);
      focusable[0]?.focus();
    };

    window.addEventListener('keydown', handleModalKeyDown);
    syncFocus();

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return () => {
      window.removeEventListener('keydown', handleModalKeyDown);
    };
  }, [handleModalKeyDown, isOpen, modalRef]);
};
