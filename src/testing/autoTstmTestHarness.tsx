import React from 'react';
import { Provider } from 'react-redux';
import { act, renderHook, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer from '../store/forecastSlice';
import { useAutoTstm } from '../hooks/useAutoTstm';
import { requestLatestTstmData } from '../utils/tstmGeneration';

jest.mock('../utils/tstmGeneration', () => {
  const actual = jest.requireActual<typeof import('../utils/tstmGeneration')>('../utils/tstmGeneration');
  return {
    ...actual,
    requestLatestTstmData: jest.fn(),
  };
});

export const mockedRequestLatest = requestLatestTstmData as jest.MockedFunction<typeof requestLatestTstmData>;

export const cachedResponse = {
  features: [{
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    },
    properties: { probability: 'TSTM' },
  }],
  run: '2026-06-13T12:00:00Z',
  domain: 'conus',
  forecastHours: [24],
  effectiveStart: '2026-06-13T12:00:00Z',
  effectiveEnd: '2026-06-14T12:00:00Z',
  thresholds: {
    calibratedThunderCoreProbability: 0.3,
    calibratedThunderSupportProbability: 0.1,
  },
  warnings: [],
  sources: {},
  generatedAt: '2026-06-13T12:00:00Z',
};

export const createAutoTstmTestStore = () => configureStore({
  reducer: { forecast: forecastReducer },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
    immutableCheck: false,
  }),
});

export const renderAutoTstm = () => {
  const store = createAutoTstmTestStore();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(() => useAutoTstm(), { wrapper });
  return { store, ...hook };
};

export const openPanelAndWaitForPreview = async (
  result: ReturnType<typeof renderAutoTstm>['result'],
) => {
  await act(async () => {
    result.current.openPanel();
  });
  await waitFor(() => {
    expect(result.current.status).toBe('preview');
  });
};

export const openPanelAndWaitForError = async (
  result: ReturnType<typeof renderAutoTstm>['result'],
) => {
  await act(async () => {
    result.current.openPanel();
  });
  await waitFor(() => {
    expect(result.current.status).toBe('error');
  });
};
