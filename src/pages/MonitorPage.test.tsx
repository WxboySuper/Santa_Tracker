import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import MonitorPage from './MonitorPage';
import monitorReducer from '../store/monitorSlice';
import forecastReducer from '../store/forecastSlice';
import themeReducer from '../store/themeSlice';
import { DEFAULT_MONITOR_SETTINGS } from '../monitor/types';

const addToast = jest.fn();

jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signed_out',
    syncedSettings: null,
    updateSyncedSettings: jest.fn(),
  }),
}));

jest.mock('../billing/EntitlementProvider', () => ({
  useEntitlement: () => ({ premiumActive: false }),
}));

jest.mock('../hooks/useCloudCycles', () => ({
  useCloudCycles: () => ({ cycles: [], loading: false, loadCycle: jest.fn() }),
}));

jest.mock('../monitor/useLiveWmsLayers', () => ({
  useLiveWmsLayers: () => ({
    radarDisplayTime: '2026-04-28T17:46:20Z',
    satelliteDisplayTime: undefined,
  }),
}));

jest.mock('../monitor/useMonitorStormReports', () => ({
  useMonitorStormReports: () => ({
    reports: [],
    loading: false,
    error: null,
    fetchedAt: null,
    totalCount: 0,
  }),
}));

jest.mock('../monitor/useMonitorNwsAlerts', () => ({
  useMonitorNwsAlerts: () => ({
    alertCollection: { type: 'FeatureCollection', features: [] },
    frameCount: 0,
    frameIndex: 0,
    loading: false,
    error: null,
    fetchedAt: null,
    polygonCount: 0,
  }),
}));

jest.mock('../monitor/useRadarSiteOptions', () => ({
  useRadarSiteOptions: () => ({
    sites: [{ id: 'KTLX', name: 'Oklahoma City', label: 'KTLX — Oklahoma City' }],
    loading: false,
    error: undefined,
  }),
}));

jest.mock('../monitor/components/MonitorMap', () => () => <div data-testid="monitor-map-stub" />);

const renderMonitorPage = () => {
  const store = configureStore({
    reducer: {
      monitor: monitorReducer,
      forecast: forecastReducer,
      theme: themeReducer,
    },
    preloadedState: {
      monitor: {
        ...DEFAULT_MONITOR_SETTINGS,
        radarMode: 'mrms-conus',
      },
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
      serializableCheck: false,
      immutableCheck: false,
    }),
  });

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/monitor']}>
        <Routes>
          <Route
            path="/monitor"
            element={<Outlet context={{ addToast }} />}
          >
            <Route index element={<MonitorPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>
  );
};

describe('MonitorPage', () => {
  test('renders monitor workspace controls and map stub', () => {
    renderMonitorPage();

    expect(screen.getByRole('heading', { name: 'Monitor' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /Monitor controls/i })).toBeInTheDocument();
    expect(screen.getByTestId('monitor-map-stub')).toBeInTheDocument();
    expect(screen.getByText(/SPC reports, and NWS alerts/i)).toBeInTheDocument();
  });
});
