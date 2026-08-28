import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ForecastWorkspaceModals from './ForecastWorkspaceModals';
import type { ForecastWorkspaceController } from './useForecastWorkspaceController';

jest.mock('../CycleManager/CycleHistoryModal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <button onClick={onClose}>History Modal</button> : null,
}));

jest.mock('../CycleManager/CopyFromPreviousModal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <button onClick={onClose}>Copy Modal</button> : null,
}));

jest.mock('../DrawingTools/ExportModal', () => ({
  __esModule: true,
  default: ({
    isOpen,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    isOpen ? (
      <div>
        <button onClick={onConfirm}>Confirm Export</button>
        <button onClick={onCancel}>Cancel Export</button>
      </div>
    ) : null,
}));

jest.mock('./ForecastTransferModal', () => ({
  __esModule: true,
  default: ({
    open,
    onClose,
    onImported,
    onExported,
    onError,
    onExportImage,
  }: {
    open: boolean;
    onClose: () => void;
    onImported: () => void;
    onExported: () => void;
    onError: (message: string) => void;
    onExportImage: () => void;
  }) =>
    open ? (
      <div>
        <button onClick={onClose}>Close Transfer</button>
        <button onClick={onImported}>Import Transfer</button>
        <button onClick={onExported}>Export Transfer</button>
        <button onClick={() => onError('transfer failed')}>Transfer Error</button>
        <button onClick={onExportImage}>Export Image</button>
      </div>
    ) : null,
}));

jest.mock('../ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

const createController = (): ForecastWorkspaceController =>
  ({
    showTransferModal: true,
    onCloseTransferModal: jest.fn(),
    onTransferImported: jest.fn(),
    onTransferExported: jest.fn(),
    onInitiateExport: jest.fn(),
    getMapView: () => ({ center: [39.8283, -98.5795], zoom: 4 }),
    forecastCycle: { currentDay: 1, cycleDate: '2026-08-18', days: {} },
    isWorkflowActive: false,
    isTransferBusy: false,
    showHistoryModal: true,
    onCloseHistoryModal: jest.fn(),
    showCopyModal: true,
    onCloseCopyModal: jest.fn(),
    isExportModalOpen: true,
    onConfirmExport: jest.fn(),
    onCancelExport: jest.fn(),
    showResetConfirm: true,
    onCancelReset: jest.fn(),
    onReset: jest.fn(),
  }) as unknown as ForecastWorkspaceController;

const renderWithProvider = (ui: React.ReactElement) => {
  const store = configureStore({
    reducer: {
      forecast: () => ({
        completionValidation: {
          lastResult: null,
          showCompletionModal: false,
          omittedDays: {},
        },
      }),
    },
  });
  return render(<Provider store={store}>{ui}</Provider>);
};

describe('ForecastWorkspaceModals', () => {
  test('wires transfer, export, and reset modal callbacks', () => {
    const controller = createController();
    const onTransferError = jest.fn();
    renderWithProvider(<ForecastWorkspaceModals controller={controller} onTransferError={onTransferError} />);

    fireEvent.click(screen.getByText('Close Transfer'));
    expect(controller.onCloseTransferModal).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Import Transfer'));
    expect(controller.onTransferImported).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Export Transfer'));
    expect(controller.onTransferExported).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Transfer Error'));
    expect(onTransferError).toHaveBeenCalledWith('transfer failed');
    fireEvent.click(screen.getByText('Export Image'));
    expect(controller.onInitiateExport).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('History Modal'));
    expect(controller.onCloseHistoryModal).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Copy Modal'));
    expect(controller.onCloseCopyModal).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Confirm Export'));
    expect(controller.onConfirmExport).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Cancel Export'));
    expect(controller.onCancelExport).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Cancel'));
    expect(controller.onCancelReset).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Reset All'));
    expect(controller.onReset).toHaveBeenCalledTimes(1);
  });
});
