import React, { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer from '../../store/forecastSlice';
import overlaysReducer from '../../store/overlaysSlice';
import ForecastTabbedToolbarLayout from './ForecastWorkspaceLayouts';
import { useForecastWorkspaceController } from './useForecastWorkspaceController';
import type { ForecastMapHandle } from '../Map/ForecastMap';

jest.mock('../Map/ForecastMap', () => {
  const { forwardRef } = jest.requireActual('react');
  return {
    __esModule: true,
    default: forwardRef(() => <div>ForecastMap Mock</div>),
  };
});

jest.mock('../DrawingTools/useExportMap', () => ({
  useExportMap: () => ({
    isExporting: false,
    isModalOpen: false,
    initiateExport: jest.fn(),
    confirmExport: jest.fn(),
    cancelExport: jest.fn(),
  }),
}));

const createStore = () => configureStore({
  reducer: {
    forecast: forecastReducer,
    overlays: overlaysReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
    immutableCheck: false,
  }),
});

const mockAddToast = jest.fn();

const LayoutHarness: React.FC<{
  cloudTools?: React.ReactNode;
}> = ({ cloudTools }) => {
  const mapRef = useRef<ForecastMapHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controller = useForecastWorkspaceController({
    onSave: jest.fn(),
    onLoad: jest.fn(),
    mapRef,
    fileInputRef,
    addToast: mockAddToast,
    cloudTools,
  });

  return <ForecastTabbedToolbarLayout controller={controller} mapRef={mapRef} />;
};

describe('Tabbed toolbar layout', () => {
  test('updates day, type, probability, and low-probability state through the shared controller', async () => {
    const user = userEvent.setup();
    const store = createStore();

    render(
      <MemoryRouter>
        <Provider store={store}>
          <LayoutHarness />
        </Provider>
      </MemoryRouter>
    );

    await user.click(screen.getByRole('tab', { name: /days/i }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('tab', { name: /draw/i }));

    await user.click(screen.getAllByRole('button', { name: /wind/i })[0]);
    await user.click(screen.getByRole('button', { name: /15%/i }));
    await user.click(screen.getByRole('button', { name: /low probability/i }));

    const forecastCycle = store.getState().forecast.forecastCycle;
    expect(forecastCycle.currentDay).toBe(2);
    expect(store.getState().forecast.drawingState.activeOutlookType).toBe('wind');
    expect(store.getState().forecast.drawingState.activeProbability).toBe('15%');
    expect(forecastCycle.days[2]?.metadata?.lowProbabilityOutlooks).toContain('wind');
  });
});
