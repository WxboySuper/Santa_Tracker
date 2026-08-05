import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import VerificationPanel from './VerificationPanel';
import stormReportsReducer from '../../store/stormReportsSlice';
import verificationReducer from '../../store/verificationSlice';
import type { RootState } from '../../store';
import type { ForecastCycle } from '../../types/outlooks';

jest.mock('../../utils/stormReportParser', () => ({
  fetchStormReports: jest.fn(),
  fetchTodayStormReports: jest.fn(),
  fetchYesterdayStormReports: jest.fn(),
  formatReportDate: jest.fn(() => '2026-04-20'),
}));

jest.mock('../../utils/verificationUtils', () => ({
  analyzeVerification: jest.fn(),
  formatVerificationSummary: jest.fn(() => 'Detailed verification summary'),
}));

const mockFetchStormReports = jest.requireMock('../../utils/stormReportParser').fetchStormReports as jest.Mock;
const mockFetchTodayStormReports = jest.requireMock('../../utils/stormReportParser').fetchTodayStormReports as jest.Mock;
const mockFetchYesterdayStormReports = jest.requireMock('../../utils/stormReportParser').fetchYesterdayStormReports as jest.Mock;
const mockFormatReportDate = jest.requireMock('../../utils/stormReportParser').formatReportDate as jest.Mock;
const mockAnalyzeVerification = jest.requireMock('../../utils/verificationUtils').analyzeVerification as jest.Mock;
const mockFormatVerificationSummary = jest.requireMock('../../utils/verificationUtils').formatVerificationSummary as jest.Mock;

const buildStore = (overrides?: Partial<RootState['stormReports']>) => {
  const stormReportsState = { ...stormReportsReducer(undefined, { type: '@@INIT' }), ...(overrides ?? {}) };
  const verificationState = { ...verificationReducer(undefined, { type: '@@INIT' }) };

  const loadedForecast: ForecastCycle = {
    currentDay: 1,
    cycleDate: '2026-04-20',
    days: {
      1: {
        day: 1,
        data: {
          categorical: new Map([['cat', []]]),
          tornado: new Map([['tor', []]]),
        },
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
  };

  verificationState.loadedForecast = loadedForecast;

  return configureStore({
    reducer: {
      stormReports: stormReportsReducer,
      verification: verificationReducer,
    },
    preloadedState: {
      stormReports: stormReportsState,
      verification: verificationState,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });
};

const analysisResult = {
  categorical: {
    hitRate: 66.7,
    hits: 2,
    misses: 1,
    byRiskLevel: {
      SLGT: { hits: 1, misses: 0, hitRate: 100, total: 1 },
      TSTM: { hits: 1, misses: 1, hitRate: 50, total: 2 },
    },
  },
  tornado: {
    hitRate: 50,
    hits: 1,
    misses: 1,
    byRiskLevel: {},
  },
  wind: {
    hitRate: 100,
    hits: 1,
    misses: 0,
    byRiskLevel: {},
  },
  hail: {
    hitRate: 0,
    hits: 0,
    misses: 1,
    byRiskLevel: {},
  },
};

const renderPanel = (store: ReturnType<typeof buildStore>, props?: React.ComponentProps<typeof VerificationPanel>) =>
  render(
    <Provider store={store}>
      <VerificationPanel {...props} />
    </Provider>
  );

describe('VerificationPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyzeVerification.mockReturnValue(analysisResult);
    mockFormatVerificationSummary.mockReturnValue('Detailed verification summary');
    mockFetchStormReports.mockResolvedValue([
      { type: 'tornado' },
      { type: 'wind' },
    ]);
    mockFetchTodayStormReports.mockResolvedValue([
      { type: 'hail' },
    ]);
    mockFetchYesterdayStormReports.mockResolvedValue([
      { type: 'hail' },
    ]);
    mockFormatReportDate.mockReturnValue('2026-04-20');
  });

  test('loads reports, shows analysis and clears state', async () => {
    const store = buildStore({
      reports: [
        { type: 'tornado' },
        { type: 'wind' },
      ] as never,
      date: '2026-04-20',
    });
    renderPanel(store, { activeOutlookType: 'categorical', selectedDay: 1, activePanel: 'analysis' });

    expect(await screen.findByText(/Report Summary/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-04-20/)).toBeInTheDocument();
    expect(screen.getAllByText(/Total Reports:/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Tornado: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Wind: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Verification Analysis - Categorical/i)).toBeInTheDocument();
    expect(screen.getByText(/Detailed verification summary/i)).toBeInTheDocument();
    expect(screen.getByText(/SLGT:/i)).toBeInTheDocument();
    expect(screen.getByText(/TSTM:/i)).toBeInTheDocument();

    const visibilityToggle = screen.getByLabelText(/Show Reports on Map/i);
    expect(visibilityToggle).toBeChecked();
    fireEvent.click(visibilityToggle);
    expect(visibilityToggle).not.toBeChecked();
    expect(screen.queryByText(/Filter by Type/i)).not.toBeInTheDocument();

    fireEvent.click(visibilityToggle);
    expect(screen.getByText(/Filter by Type/i)).toBeInTheDocument();

    const tornadoToggle = screen.getByLabelText(/Tornado \(1\)/i);
    expect(tornadoToggle).toBeChecked();
    fireEvent.click(tornadoToggle);
    expect(tornadoToggle).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /Clear Reports/i }));
    expect(screen.queryByText(/Report Summary/i)).not.toBeInTheDocument();
  });

  test('shows the current-day info banner and fetch failures', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 3, 20, 12, 0, 0));

    try {
      const store = buildStore();
      renderPanel(store, { activePanel: 'setup' });

      fireEvent.click(screen.getByRole('button', { name: /Load Reports/i }));

      await waitFor(() => expect(mockFetchTodayStormReports).toHaveBeenCalled());
      expect(mockFetchYesterdayStormReports).not.toHaveBeenCalled();
      expect(mockFetchStormReports).not.toHaveBeenCalled();
      await waitFor(() => expect(store.getState().stormReports.reports).toHaveLength(1));

      mockFetchYesterdayStormReports.mockRejectedValueOnce(new Error('Service unavailable'));
      fireEvent.change(screen.getByLabelText(/Select Date/i), { target: { value: '2026-04-19' } });
      fireEvent.click(screen.getByRole('button', { name: /Load Reports/i }));

      expect(mockFetchYesterdayStormReports).toHaveBeenCalled();
      expect(await screen.findByText(/Service unavailable/i)).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
