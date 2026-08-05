import { useCallback, useEffect, useRef } from 'react';

export interface ModalFocusTrapOptions {
  /** When true, the trap is active and focus is moved into the modal. */
  active: boolean;
  /** Called when the user presses Escape while the trap is active. */
  onClose?: () => void;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'iframe',
  'audio[controls]',
  'video[controls]',
].join(', ');

/** Returns the visible focusable elements within a container. */
const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });

/** Handles Escape: closes the modal when the key matches. Returns true when consumed. */
const handleEscapeKey = (event: KeyboardEvent, onClose?: () => void): boolean => {
  if (event.key !== 'Escape') {
    return false;
  }
  event.preventDefault();
  onClose?.();
  return true;
};

/** Handles Tab/Shift+Tab so focus stays inside the modal. */
const handleTabKey = (event: KeyboardEvent, modal: HTMLElement): void => {
  const elements = getFocusableElements(modal);
  if (elements.length === 0) {
    event.preventDefault();
    return;
  }

  const first = elements[0];
  const last = elements[elements.length - 1];
  const activeEl = document.activeElement as HTMLElement | null;
  const focusIsOutside = !modal.contains(activeEl);

  if (event.shiftKey && (activeEl === first || focusIsOutside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (activeEl === last || focusIsOutside)) {
    event.preventDefault();
    first.focus();
  }
};

/** Toggles background content out of the accessibility tree and restores it later. */
const isolateBackground = (): (() => void) => {
  const mainLandmark = document.querySelector('main');
  const previousAriaHidden = mainLandmark?.getAttribute('aria-hidden');
  if (mainLandmark) {
    mainLandmark.setAttribute('aria-hidden', 'true');
  }
  return () => {
    if (!mainLandmark) {
      return;
    }
    if (previousAriaHidden === undefined || previousAriaHidden === null) {
      mainLandmark.removeAttribute('aria-hidden');
    } else {
      mainLandmark.setAttribute('aria-hidden', previousAriaHidden);
    }
  };
};

/**
 * Hardened, shared modal focus behavior used by every non-Radix dialog:
 * - Traps Tab / Shift+Tab inside the modal.
 * - Moves focus to the first focusable element when opened.
 * - Restores focus to the previously focused element when closed.
 * - Closes on Escape.
 * - Isolates background content from assistive technology while open.
 *
 * Radix-based dialogs (src/components/ui/dialog.tsx) already provide these
 * guarantees; this hook consolidates the behavior for the remaining custom
 * dialogs so keyboard and screen-reader users get a consistent experience.
 */
export const useModalFocusTrap = ({
  active,
  onClose,
}: ModalFocusTrapOptions) => {
  const modalRef = useRef<HTMLElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }

    const modal = modalRef.current;
    if (!modal) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    previouslyFocusedRef.current = previouslyFocused;

    getFocusableElements(modal)[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (handleEscapeKey(event, onClose)) {
        return;
      }
      if (event.key === 'Tab') {
        handleTabKey(event, modal);
      }
    };

    const restoreBackground = isolateBackground();
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      restoreBackground();
      previouslyFocusedRef.current?.focus();
    };
  }, [active, onClose]);

  const setModalRef = useCallback((node: HTMLElement | null) => {
    modalRef.current = node;
  }, []);

  return { modalRef, setModalRef };
};

export default useModalFocusTrap;
