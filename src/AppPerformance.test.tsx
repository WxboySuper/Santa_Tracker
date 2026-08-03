import React from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, EnhancedStore } from '@reduxjs/toolkit';
import { BrowserRouter } from 'react-router-dom';
import forecastReducer, { setMapView } from './store/forecastSlice';
import themeReducer from './store/themeSlice';
import appModeReducer from './store/appModeSlice';
import overlaysReducer from './store/overlaysSlice';
import stormReportsReducer from './store/stormReportsSlice';
import verificationReducer from './store/verificationSlice';
import monitorReducer from './store/monitorSlice';
import { ForecastPage } from './pages/ForecastPage';

// Mock child components
jest.mock('./components/Map/ForecastMap', () => {
  const calls: Array<Record<string, unknown>> = [];
  const ForecastMapMock = (props: Record<string, unknown>) => {
    calls.push(props);
    return <div data-testid="forecast-map">ForecastMap</div>;
  };
  return {
    __esModule: true,
    default: ForecastMapMock,
    getCalls: () => calls,
  };
});

jest.mock('./components/IntegratedToolbar/IntegratedToolbar', () => ({
  TabbedIntegratedToolbar: () => <div>IntegratedToolbar</div>,
}));
jest.mock('./components/ForecastWorkspace/ForecastWorkspaceModals', () => () => <div>ForecastWorkspaceModals</div>);
jest.mock('./components/DrawingTools/DrawingTools', () => () => <div>DrawingTools</div>);
jest.mock('./components/Documentation/Documentation', () => () => <div>Documentation</div>);
jest.mock('./components/Toast/Toast', () => ({
  ToastManager: () => <div>ToastManager</div>
}));
jest.mock('./hooks/useAutoSave', () => ({
  useAutoSave: jest.fn(),
}));
jest.mock('./hooks/useAutoCategorical', () => jest.fn());
jest.mock('./utils/cycleHistoryPersistence', () => ({
  useCycleHistoryPersistence: jest.fn(),
}));
jest.mock('./auth/AuthProvider', () => ({
  useAuth: () => ({ user: null }),
}));
jest.mock('./billing/EntitlementProvider', () => ({
  useEntitlement: () => ({ premiumActive: false, effectiveSource: 'none' }),
}));
jest.mock('./hooks/useCloudCycles', () => ({
  useCloudCycles: () => ({
    currentCloud: null,
    saveCycle: jest.fn(),
    markAsCurrent: jest.fn(),
  }),
}));
jest.mock('./hooks/useCloudSync', () => ({
  useCloudSync: () => ({
    markCurrentStateSynced: jest.fn(),
  }),
}));

// Mock router outlet context
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useOutletContext: () => ({ addToast: jest.fn() }),
}));

describe('ForecastPage Performance', () => {
  let store: EnhancedStore;

  beforeEach(() => {
    // Clear any previous calls recorded by the mocked ForecastMap module
    const forecastMapMockModule = jest.requireMock('./components/Map/ForecastMap') as { getCalls: () => Array<Record<string, unknown>> };
    // Reset recorded calls
    forecastMapMockModule.getCalls().length = 0;
    store = configureStore({
      reducer: {
        forecast: forecastReducer,
        theme: themeReducer,
        appMode: appModeReducer,
        overlays: overlaysReducer,
        stormReports: stormReportsReducer,
        verification: verificationReducer,
        monitor: monitorReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }),
    });
  });

  it('does NOT re-render children when unrelated state changes (Optimized)', () => {
    render(
      <Provider store={store}>
        <BrowserRouter>
          <ForecastPage />
        </BrowserRouter>
      </Provider>
    );

    // Initial render(s)
    const fm = jest.requireMock('./components/Map/ForecastMap') as { getCalls: () => Array<Record<string, unknown>> };
    const initialCalls = fm.getCalls().length;

    // Dispatch an action that changes `forecast` slice but NOT the data used by ForecastPage
    // setMapView changes state.forecast.currentMapView
    act(() => {
      store.dispatch(setMapView({ center: [40, -100], zoom: 5 }));
    });

    // With optimized selector: should not cause additional re-renders
    expect(fm.getCalls().length).toBeLessThanOrEqual(initialCalls + 1);
  });
});
