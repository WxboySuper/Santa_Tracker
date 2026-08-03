import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import CycleHistoryModal from './CycleHistoryModal';
import CopyFromPreviousModal from './CopyFromPreviousModal';
import forecastReducer, { type ForecastState } from '../../store/forecastSlice';
import { AppLayoutContext } from '../Layout/AppLayout';

type ConfirmationModalMockProps = {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// Mock child components
jest.mock('../DrawingTools/ConfirmationModal', () => {
  const ConfirmationModalMock = ({ isOpen, title, message, onConfirm, onCancel }: ConfirmationModalMockProps) =>
    isOpen ? (
      <div data-testid="confirmation-modal">
        <h2>{title}</h2>
        <p>{message}</p>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null;

  return {
    __esModule: true,
    default: ConfirmationModalMock,
  };
});

// Mock fileUtils
jest.mock('../../utils/fileUtils', () => ({
  deserializeForecast: jest.fn((data) => ({
    cycleDate: '2026-04-21',
    currentDay: 1,
    days: {},
    ...data
  })),
  cloneForecastCycle: jest.fn((cycle) => JSON.parse(JSON.stringify(cycle))),
  cloneForecastDay: jest.fn((day) => JSON.parse(JSON.stringify(day)))
}));

type ForecastStateOverrides = {
  forecastCycle?: Partial<ForecastState['forecastCycle']>;
  drawingState?: Partial<ForecastState['drawingState']>;
  currentMapView?: Partial<ForecastState['currentMapView']>;
  isSaved?: boolean;
  emergencyMode?: boolean;
  savedCycles?: ForecastState['savedCycles'];
  historyByDay?: ForecastState['historyByDay'];
};

const baseForecastState: ForecastState = {
  forecastCycle: {
    currentDay: 1,
    cycleDate: '2026-04-20',
    days: {},
  },
  drawingState: {
    activeOutlookType: 'tornado',
    activeProbability: '2%',
    isSignificant: false,
  },
  currentMapView: {
    center: [39.8283, -98.5795],
    zoom: 4,
  },
  isSaved: true,
  emergencyMode: false,
  savedCycles: [],
  historyByDay: {},
};

const buildStore = (overrides: ForecastStateOverrides = {}) => {
  const forecastState: ForecastState = {
    ...baseForecastState,
    ...overrides,
    forecastCycle: {
      ...baseForecastState.forecastCycle,
      ...overrides.forecastCycle,
    },
    drawingState: {
      ...baseForecastState.drawingState,
      ...overrides.drawingState,
    },
    currentMapView: {
      ...baseForecastState.currentMapView,
      ...overrides.currentMapView,
    },
    savedCycles: overrides.savedCycles ?? baseForecastState.savedCycles,
    historyByDay: overrides.historyByDay ?? baseForecastState.historyByDay,
  };

  return configureStore({
    reducer: {
      forecast: forecastReducer,
    },
    preloadedState: {
      forecast: forecastState,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });
};

const mockAddToast = jest.fn();
const mockAppLayoutValue = { addToast: mockAddToast };

const renderWithForecastStore = (
  ui: React.ReactElement,
  overrides: ForecastStateOverrides = {},
) => {
  const store = buildStore(overrides);

  return {
    store,
    ...render(
      <Provider store={store}>
        <AppLayoutContext.Provider value={mockAppLayoutValue}>
          {ui}
        </AppLayoutContext.Provider>
      </Provider>
    ),
  };
};

const renderCycleHistoryModal = (
  props: Partial<React.ComponentProps<typeof CycleHistoryModal>> = {},
  overrides: ForecastStateOverrides = {},
) => renderWithForecastStore(
  <CycleHistoryModal isOpen onClose={jest.fn()} {...props} />,
  overrides,
);

const renderCopyFromPreviousModal = (onClose = jest.fn()) =>
  renderWithForecastStore(<CopyFromPreviousModal isOpen onClose={onClose} />);

const openCycleSaveForm = () => {
  fireEvent.click(screen.getByRole('button', { name: /Save Current Cycle/i }));
};

describe('CycleManager Components', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('CycleHistoryModal', () => {
    it('renders nothing when closed', () => {
      const { container } = render(
        <Provider store={buildStore()}>
          <AppLayoutContext.Provider value={mockAppLayoutValue}>
            <CycleHistoryModal isOpen={false} onClose={jest.fn()} />
          </AppLayoutContext.Provider>
        </Provider>
      );
      expect(container.firstChild).toBeNull();
      expect(document.body.querySelector('.history-modal-root')).toBeNull();
    });

    it('GFC-WEB-G: portals the modal shell to document.body with notranslate', () => {
      renderCycleHistoryModal();
      const root = document.body.querySelector('.history-modal-root');
      expect(root).toBeInTheDocument();
      expect(root).toHaveClass('notranslate');
    });

    it('renders header and empty state when open with no cycles', () => {
      renderCycleHistoryModal();
      expect(screen.getByRole('heading', { name: /Saved Cycles/i })).toBeInTheDocument();
      expect(screen.getByText(/No saved cycles yet/i)).toBeInTheDocument();
    });

    it('allows saving the current cycle', () => {
      renderCycleHistoryModal();

      openCycleSaveForm();
      const input = screen.getByPlaceholderText(/Optional label/i);
      fireEvent.change(input, { target: { value: 'New Test Cycle' } });
      
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
      expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('saved successfully'), 'success');
    });

    it('handles saving with empty label', () => {
      renderCycleHistoryModal();

      openCycleSaveForm();
      fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
      expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('saved successfully'), 'success');
    });

    it('allows cancelling the save form', () => {
      renderCycleHistoryModal();

      openCycleSaveForm();
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(screen.queryByPlaceholderText(/Optional label/i)).not.toBeInTheDocument();
    });

    it('renders saved cycles and allows loading', async () => {
      const savedCycles = [
        {
          id: 'cycle-1',
          timestamp: '2026-04-20T10:00:00Z',
          cycleDate: '2026-04-20',
          label: 'Test Cycle',
          forecastCycle: { currentDay: 1, cycleDate: '2026-04-20', days: {} },
          stats: { forecastDays: 2, totalOutlooks: 1, totalFeatures: 5 },
        },
      ];
      const onClose = jest.fn();
      
      renderCycleHistoryModal({ onClose }, { savedCycles });

      expect(screen.getByText(/Test Cycle/i)).toBeInTheDocument();
      expect(screen.getByText(/2 forecast days/i)).toBeInTheDocument();
      
      fireEvent.click(screen.getByRole('button', { name: /Load/i }));
      expect(screen.getByTestId('confirmation-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Confirm'));
      expect(mockAddToast).toHaveBeenCalledWith('Cycle loaded!', 'success');
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('renders cycle with single day summary', () => {
      const savedCycles = [
        {
          id: 'cycle-1',
          timestamp: '2026-04-20T10:00:00Z',
          cycleDate: '2026-04-20',
          label: 'Single Day',
          forecastCycle: { currentDay: 1, cycleDate: '2026-04-20', days: {} },
          stats: { forecastDays: 1, totalOutlooks: 1, totalFeatures: 5 },
        },
      ];
      renderCycleHistoryModal({}, { savedCycles });

      expect(screen.getByText(/1 forecast day/i)).toBeInTheDocument();
    });

    it('allows deleting a cycle', () => {
      const savedCycles = [{ id: 'cycle-1', timestamp: '2026-04-20T10:00:00Z', cycleDate: '2026-04-20', label: 'To Delete', forecastCycle: {}, stats: {} }];
      
      renderCycleHistoryModal({}, { savedCycles });

      fireEvent.click(screen.getByTitle('Delete this cycle'));
      fireEvent.click(screen.getByText('Confirm'));
      expect(screen.queryByTestId('confirmation-modal')).not.toBeInTheDocument();
    });

    it('handles Escape key to close modal', () => {
      const onClose = jest.fn();
      renderCycleHistoryModal({ onClose });

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });

    it('traps focus with Tab and Shift+Tab', () => {
      renderCycleHistoryModal();

      const focusable = screen.getAllByRole('button');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      last.focus();
      fireEvent.keyDown(window, { key: 'Tab' });
      expect(document.activeElement).toBe(first);

      first.focus();
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(last);
    });
  });

  describe('CopyFromPreviousModal', () => {
    it('renders file input and day selectors when open', () => {
      renderCopyFromPreviousModal();
      expect(screen.getByText(/Copy from Previous Cycle/i)).toBeInTheDocument();
    });

    it('handles successful file loading', async () => {
      renderCopyFromPreviousModal();

      const file = new File(['{"cycleDate": "2026-04-21"}'], 'forecast.json', { type: 'application/json' });
      const input = screen.getByLabelText(/Load Forecast File:/i);

      // Trigger file load
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText(/✓ Loaded: forecast.json/iu)).toBeInTheDocument();
      });

      // Now test copying
      fireEvent.click(screen.getByRole('button', { name: /Copy Features/i }));
      expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('Copied Day'), 'success');
    });

    it('handles file parsing errors', async () => {
      renderCopyFromPreviousModal();

      const file = new File(['invalid json'], 'bad.json', { type: 'application/json' });
      const input = screen.getByLabelText(/Load Forecast File:/i);

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('Failed to load forecast file'), 'error');
      });
    });

    it('traps focus with Tab and Shift+Tab', () => {
      renderCopyFromPreviousModal();

      // When no cycle is loaded, only Cancel and disabled Copy are in tab order
      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      cancelBtn.focus();
      fireEvent.keyDown(window, { key: 'Tab' });
      expect(document.activeElement).not.toBe(cancelBtn);
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(cancelBtn);
    });


    it('closes on Escape key', () => {
      const onClose = jest.fn();
      renderCopyFromPreviousModal(onClose);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });
});
