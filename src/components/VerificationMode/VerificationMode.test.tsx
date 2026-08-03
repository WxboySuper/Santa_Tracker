import { forwardRef as mockForwardRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import VerificationMode from './VerificationMode';
import verificationReducer from '../../store/verificationSlice';

const mockAddToast = jest.fn();
const mockQueueProductMetric = jest.fn();

jest.mock('../../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../Layout/AppLayout', () => ({
  useAppLayout: jest.fn(() => ({ addToast: mockAddToast })),
}));

jest.mock('../../utils/productMetrics', () => ({
  queueProductMetric: (...args: unknown[]) => mockQueueProductMetric(...args),
}));

jest.mock('../../utils/fileUtils', () => ({
  validateForecastData: jest.fn(),
  deserializeForecast: jest.fn(),
}));

jest.mock('../Map/VerificationMap', () => {
  return {
    __esModule: true,
    default: mockForwardRef(
      ({ activeOutlookType, selectedDay }: { activeOutlookType: string; selectedDay: number }, _ref) => (
        <div data-testid="verification-map">{`${activeOutlookType}:${selectedDay}`}</div>
      )
    ),
  };
});

jest.mock('../Verification/VerificationPanel', () => ({
  __esModule: true,
  default: ({ activePanel, activeOutlookType, selectedDay }: { activePanel: string; activeOutlookType: string; selectedDay: number }) => (
    <div data-testid="verification-panel">{`${activePanel}:${activeOutlookType}:${selectedDay}`}</div>
  ),
}));

const mockUseAuth = jest.requireMock('../../auth/AuthProvider').useAuth as jest.Mock;
const mockValidateForecastData = jest.requireMock('../../utils/fileUtils').validateForecastData as jest.Mock;
const mockDeserializeForecast = jest.requireMock('../../utils/fileUtils').deserializeForecast as jest.Mock;

class MockFileReader {
  onload: ((event: { target: { result: string } }) => void) | null = null;
  onerror: (() => void) | null = null;

  readAsText() {
    this.onload?.({ target: { result: '{"ok":true}' } });
  }
}

const renderWithStore = () => {
  const store = configureStore({
    reducer: { verification: verificationReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

  return render(
    <Provider store={store}>
      <VerificationMode />
    </Provider>
  );
};

describe('VerificationMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' }, status: 'signed_in' });
    mockValidateForecastData.mockReturnValue(true);
    mockDeserializeForecast.mockReturnValue({
      currentDay: 1,
      cycleDate: '2026-04-20',
      days: {
        1: {
          day: 1,
          data: { categorical: new Map([['cat', []]]) },
          metadata: {
            issueDate: '2026-04-20T06:00:00Z',
            validDate: '2026-04-20T06:00:00Z',
            issuanceTime: '0600',
            createdAt: '2026-04-20T06:00:00Z',
            lastModified: '2026-04-20T06:00:00Z',
            lowProbabilityOutlooks: [],
          },
        },
        4: {
          day: 4,
          data: { 'day4-8': new Map([['day4', []]]) },
          metadata: {
            issueDate: '2026-04-20T06:00:00Z',
            validDate: '2026-04-20T06:00:00Z',
            issuanceTime: '0600',
            createdAt: '2026-04-20T06:00:00Z',
            lastModified: '2026-04-20T06:00:00Z',
            lowProbabilityOutlooks: [],
          },
        },
      },
    });
    Object.defineProperty(globalThis, 'FileReader', {
      configurable: true,
      writable: true,
      value: MockFileReader,
    });
  });

  test('loads a forecast, updates the selected day, and clears it again', async () => {
    const user = userEvent.setup();

    renderWithStore();

    expect(screen.getByText(/Load Forecast/i)).toBeInTheDocument();
    expect(screen.queryByTestId('verification-panel')).not.toBeInTheDocument();

    const fileInput = screen.getByLabelText(/Choose Forecast File/i) as HTMLInputElement;
    await user.upload(fileInput, new File(['{}'], 'forecast.json', { type: 'application/json' }));

    await waitFor(() => expect(screen.getByText(/Forecast Loaded/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('verification-panel')).toHaveTextContent('setup:categorical:1'));
    expect(screen.getByTestId('verification-map')).toHaveTextContent('categorical:1');
    expect(screen.getByRole('button', { name: /Day 1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Day 4/i })).toBeInTheDocument();
    expect(mockQueueProductMetric).toHaveBeenCalledWith({ event: 'verification_run', user: { uid: 'user-1' } });

    await user.click(screen.getByRole('button', { name: /Day 4/i }));
    expect(screen.getByTestId('verification-map')).toHaveTextContent('categorical:4');

    await user.click(screen.getByRole('button', { name: /Tornado/i }));
    expect(screen.getByTestId('verification-map')).toHaveTextContent('tornado:4');

    await user.click(screen.getByRole('button', { name: /Analysis/i }));
    expect(screen.getByTestId('verification-panel')).toHaveTextContent('analysis:tornado:4');

    await user.click(screen.getByRole('button', { name: /Load Data/i }));
    await user.click(screen.getByRole('button', { name: /Load Different Forecast/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Clear/i }));

    await waitFor(() => expect(screen.getByText(/Choose Forecast File/i)).toBeInTheDocument());
    expect(screen.queryByText(/Forecast Loaded/i)).not.toBeInTheDocument();
  });

  test('surfaces file validation errors', async () => {
    const user = userEvent.setup();
    mockValidateForecastData.mockReturnValue(false);

    renderWithStore();

    const fileInput = screen.getByLabelText(/Choose Forecast File/i) as HTMLInputElement;
    await user.upload(fileInput, new File(['{}'], 'invalid.json', { type: 'application/json' }));

    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.stringContaining('Invalid forecast file format'),
        'error'
      )
    );
  });

  test('ignores empty file selections and can cancel clearing a forecast', async () => {
    const user = userEvent.setup();

    renderWithStore();

    const fileInput = screen.getByLabelText(/Choose Forecast File/i) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [] } });
    expect(mockAddToast).not.toHaveBeenCalled();

    await user.upload(fileInput, new File(['{}'], 'forecast.json', { type: 'application/json' }));
    await waitFor(() => expect(screen.getByText(/Forecast Loaded/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Load Different Forecast/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.getByText(/Forecast Loaded/i)).toBeInTheDocument();
  });
});
