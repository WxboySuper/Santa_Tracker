import { useCallback, useEffect } from 'react';
import './Toast.css';

export interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast toast-${type}`}>
      {message}
    </div>
  );
};

export interface ToastManagerProps {
  toasts: Array<{ id: string; message: string; type?: 'info' | 'success' | 'warning' | 'error' }>;
  onDismiss: (id: string) => void;
}

// Small wrapper to avoid inline arrow functions in parent JSX
const ToastItem: React.FC<{ toast: { id: string; message: string; type?: 'info' | 'success' | 'warning' | 'error' }; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  const handleClose = useCallback(() => {
    onDismiss(toast.id);
  }, [onDismiss, toast.id]);

  return <Toast message={toast.message} type={toast.type} onClose={handleClose} />;
};

export const ToastManager: React.FC<ToastManagerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="toast-container" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

export default Toast;
