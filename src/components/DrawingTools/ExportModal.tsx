import React, { useState, useEffect, useCallback } from 'react';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';
import './ExportModal.css';

interface ExportFormProps {
  title: string;
  onTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCancel: () => void;
}

const ExportForm: React.FC<ExportFormProps> = ({ title, onTitleChange, onCancel }) => (
  <>
    <label htmlFor="export-filename" className="sr-only">Image Title (optional)</label>
    <input
      id="export-filename"
      type="text"
      className="export-modal-input"
      placeholder="Enter a title (optional)"
      value={title}
      onChange={onTitleChange}
    />
    <div className="export-modal-actions">
      <button
        type="button"
        className="export-modal-btn export-modal-cancel"
        onClick={onCancel}
      >
        Cancel
      </button>
      <button
        type="submit"
        className="export-modal-btn export-modal-confirm"
      >
        Export
      </button>
    </div>
  </>
);

interface ExportModalProps {
  isOpen: boolean;
  onConfirm: (title: string) => void;
  onCancel: () => void;
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onConfirm, onCancel }) => {
  const [title, setTitle] = useState('');
  const { setModalRef } = useModalFocusTrap({ active: isOpen, onClose: onCancel });

  // Reset the title when opened; the focus trap moves focus into the modal.
  useEffect(() => {
    if (isOpen) {
      setTitle('');
    }
  }, [isOpen]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(title);
  }, [onConfirm, title]);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="export-modal-overlay">
      <div className="export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title" ref={setModalRef}>
        <h3 id="export-title">Export Forecast Image</h3>
        <form onSubmit={handleSubmit}>
          <ExportForm
            title={title}
            onTitleChange={handleTitleChange}
            onCancel={onCancel}
          />
        </form>
      </div>
    </div>
  );
};

export default ExportModal;
