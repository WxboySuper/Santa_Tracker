import React, { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectCurrentDay, copyFeaturesFromPrevious } from '../../store/forecastSlice';
import { DayType, ForecastCycle } from '../../types/outlooks';
import { deserializeForecast } from '../../utils/fileUtils';
import { useAppLayout } from '../Layout/AppLayout';
import './CopyFromPreviousModal.css';

interface CopyFromPreviousModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DAYS: DayType[] = [1, 2, 3, 4, 5, 6, 7, 8];

// Accessibility helpers for modals: focusable elements and keyboard handling
const getFocusableElements = (root: HTMLElement | null): HTMLElement[] => {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
};

// Returns true when Shift+Tab should wrap focus back to the last element.
const shouldWrapBackward = (focusable: HTMLElement[], isInModal: boolean): boolean =>
  !isInModal || document.activeElement === focusable[0];

// Returns true when Tab should wrap focus forward to the first element.
const shouldWrapForward = (focusable: HTMLElement[], isInModal: boolean): boolean =>
  !isInModal || document.activeElement === focusable[focusable.length - 1];

// Separate function to handle tab navigation for better readability and maintainability. It checks if the currently focused element is the first or last focusable element in the modal and cycles focus accordingly when the Tab key is pressed, ensuring that keyboard users can navigate through the modal without losing focus outside of it.
const handleTabNavigation = (event: KeyboardEvent, modalRef: React.RefObject<HTMLDivElement | null>) => {
  if (!modalRef.current) return;
  const focusable = getFocusableElements(modalRef.current);
  if (focusable.length === 0) return;
  const isInModal = focusable.includes(document.activeElement as HTMLElement);

  if (event.shiftKey && shouldWrapBackward(focusable, isInModal)) {
    event.preventDefault();
    focusable[focusable.length - 1].focus();
  } else if (!event.shiftKey && shouldWrapForward(focusable, isInModal)) {
    event.preventDefault();
    focusable[0].focus();
  }
};

// Handler for keyboard events in the modal, which implements focus trapping and allows closing the modal with the Escape key. It checks for Tab key presses to cycle focus within the modal and ensures that focus does not escape to elements outside the modal while it is open. It also listens for the Escape key to trigger the onClose function, allowing users to easily close the modal using the keyboard. This enhances accessibility for users who rely on keyboard navigation.
const handleModalKeyDown = (
  event: KeyboardEvent,
  modalRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void
) => {
  if (event.key === 'Escape') {
    onClose();
    return;
  }

  if (event.key === 'Tab') {
    handleTabNavigation(event, modalRef);
  }
};

// Read a file as text (Promise wrapper) and deserialize into ForecastCycle
const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });

/** Reads and parses a GFC JSON forecast file into a ForecastCycle object. */
const parseForecastFile = async (file: File): Promise<ForecastCycle> => {
  const content = await readFileAsText(file);
  const parsed = JSON.parse(content);
  return deserializeForecast(parsed);
};

type CopyModalHeaderProps = {
  onClose: () => void;
};

/** Renders the copy-modal title bar and close control. */
const CopyModalHeader: React.FC<CopyModalHeaderProps> = ({ onClose }) => (
  <div className="copy-modal-header">
    <h2 id="copy-previous-title">Copy from Previous Cycle</h2>
    <button className="copy-modal-close" onClick={onClose} aria-label="Close copy from previous modal">✕</button>
  </div>
);

type CopyFileSectionProps = {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  loadedCycle: ForecastCycle | null;
  loadedFileName: string;
  onFileLoad: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

/** Renders the forecast-file picker and loaded-file summary. */
const CopyFileSection: React.FC<CopyFileSectionProps> = ({
  fileInputRef,
  loadedCycle,
  loadedFileName,
  onFileLoad,
}) => (
  <div className="copy-form-group">
    <label htmlFor="file-upload">Load Forecast File:</label>
    <input
      id="file-upload"
      ref={fileInputRef}
      type="file"
      accept=".json"
      onChange={onFileLoad}
      className="copy-file-input"
    />
    {loadedCycle && (
      <div className="copy-loaded-info">
        ✓ Loaded: {loadedFileName} (Cycle Date: {new Date(loadedCycle.cycleDate).toLocaleDateString()})
      </div>
    )}
  </div>
);

type CopyDaySelectorProps = {
  id: string;
  label: string;
  value: DayType;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
};

/** Renders one day selector used by the source and target copy controls. */
const CopyDaySelector: React.FC<CopyDaySelectorProps> = ({ id, label, value, onChange }) => (
  <div className="copy-form-group">
    <label htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={onChange} className="copy-select">
      {DAYS.map((day) => (
        <option key={day} value={day}>
          Day {day}
        </option>
      ))}
    </select>
  </div>
);

type CopyDaysSectionProps = {
  sourceDay: DayType;
  targetDay: DayType;
  onSourceDayChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onTargetDayChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
};

/** Renders the paired source and target day selectors. */
const CopyDaysSection: React.FC<CopyDaysSectionProps> = ({
  sourceDay,
  targetDay,
  onSourceDayChange,
  onTargetDayChange,
}) => (
  <div className="copy-days-row">
    <CopyDaySelector id="source-day" label="From Day:" value={sourceDay} onChange={onSourceDayChange} />
    <div className="copy-arrow">→</div>
    <CopyDaySelector
      id="target-day"
      label="To Day (Current Cycle):"
      value={targetDay}
      onChange={onTargetDayChange}
    />
  </div>
);

/** Renders the conversion note shown before copying previous-cycle features. */
const CopyInfoBox: React.FC = () => (
  <div className="copy-info-box">
    <strong>Note:</strong> This will copy outlook features from the loaded file to your current cycle.
    The system will automatically convert outlook types when copying between days with different formats
    (e.g., Day 4-8 → Day 3, Day 3 → Day 2). Existing features on the target day will be replaced.
  </div>
);

type CopyModalFooterProps = {
  disabled: boolean;
  onClose: () => void;
  onCopy: () => void;
};

/** Renders cancel and copy actions for the copy-modal footer. */
const CopyModalFooter: React.FC<CopyModalFooterProps> = ({ disabled, onClose, onCopy }) => (
  <div className="copy-modal-footer">
    <button className="copy-btn-cancel" onClick={onClose}>
      Cancel
    </button>
    <button className="copy-btn-copy" onClick={onCopy} disabled={disabled}>
      Copy Features
    </button>
  </div>
);

// Component for the "Copy from Previous Cycle" modal, which allows users to load a forecast file from a previous cycle and copy features from a selected day in that file to a selected day in the current cycle. The modal includes file input for loading the forecast, dropdowns for selecting source and target days, and handles the copying logic while providing feedback through toast notifications. It also implements accessibility features such as focus trapping and keyboard navigation.
const CopyFromPreviousModal: React.FC<CopyFromPreviousModalProps> = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const { addToast } = useAppLayout();
  const currentDay = useSelector(selectCurrentDay);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const [loadedCycle, setLoadedCycle] = useState<ForecastCycle | null>(null);
  const [loadedFileName, setLoadedFileName] = useState<string>('');
  const [sourceDay, setSourceDay] = useState<DayType>(1);
  const [targetDay, setTargetDay] = useState<DayType>(currentDay);

  useEffect(() => {
    if (!isOpen) return;

    /** Keyboard event handler that traps focus and allows Escape to close the modal. */
    const handler = (event: KeyboardEvent) => handleModalKeyDown(event, modalRef, onClose);

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const first = getFocusableElements(modalRef.current)[0];
    first?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  // Handler for file selection when loading a forecast from JSON, which reads the selected file and parses it as a ForecastCycle object. It updates the local state with the loaded cycle and file name, and shows error toasts if the file cannot be read or parsed correctly. After handling the file, it resets the file input value to allow for loading the same file again if needed.
  const handleFileLoad = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const cycle = await parseForecastFile(file);
      setLoadedCycle(cycle);
      setLoadedFileName(file.name);
    } catch {
      addToast('Failed to load forecast file. Please ensure it\'s a valid GFC JSON file.', 'error');
    } finally {
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handler for copying features from the loaded cycle's source day to the current cycle's target day. It checks if a cycle is loaded, then dispatches the copyFeaturesFromPrevious action with the selected source and target days. After copying, it shows a success toast notification and closes the modal.
  const handleCopy = () => {
    if (!loadedCycle) {
      addToast('Please load a forecast file first.', 'warning');
      return;
    }

    dispatch(copyFeaturesFromPrevious({
      sourceCycle: loadedCycle,
      sourceDay,
      targetDay
    }));

    addToast(`Copied Day ${sourceDay} features to current cycle Day ${targetDay}.`, 'success');
    onClose();
  };

  // Handlers for day selection changes
  const handleSourceDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSourceDay(Number(e.target.value) as DayType);
  };

  // Note: The target day defaults to the currently selected day in the app, but the user can change it to any day. The copy logic will handle converting features appropriately based on the source and target day formats.
  const handleTargetDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTargetDay(Number(e.target.value) as DayType);
  };

  return (
    <>
      <div className="copy-modal-overlay" onClick={onClose} />
      <div
        className="copy-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-previous-title"
        ref={modalRef}
      >
        <CopyModalHeader onClose={onClose} />
        <div className="copy-modal-body">
          <CopyFileSection
            fileInputRef={fileInputRef}
            loadedCycle={loadedCycle}
            loadedFileName={loadedFileName}
            onFileLoad={handleFileLoad}
          />
          <CopyDaysSection
            sourceDay={sourceDay}
            targetDay={targetDay}
            onSourceDayChange={handleSourceDayChange}
            onTargetDayChange={handleTargetDayChange}
          />
          <CopyInfoBox />
        </div>
        <CopyModalFooter disabled={!loadedCycle} onClose={onClose} onCopy={handleCopy} />
      </div>
    </>
  );
};

export default CopyFromPreviousModal;
