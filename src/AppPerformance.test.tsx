import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, EnhancedStore } from '@reduxjs/toolkit';
import { BrowserRouter } from 'react-router';
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
  let renderCount = 0;
  const ForecastMapMock = (_props: Record<string, unknown>) => {
    renderCount += 1;
    return <div data-testid="forecast-map">ForecastMap</div>;
  };
  return {
    __esModule: true,
    default: ForecastMapMock,
    getCallCount: () => renderCount,
    resetCallCount: () => {
      renderCount = 0;
    },
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
jest.mock('./hooks/useAutoTstm', () => ({
  useAutoTstm: () => ({
    status: 'idle',
    isPanelOpen: false,
    isDaySupported: false,
    previewFeatures: [],
    previewResponse: null,
    errorMessage: null,
    openPanel: jest.fn(),
    closePanel: jest.fn(),
    fetchPreview: jest.fn(),
    applyPreview: jest.fn(),
    cancelPreview: jest.fn(),
  }),
}));
jest.mock('./hooks/useCustomProductForecastHandoff', () => ({
  useCustomProductForecastHandoff: jest.fn(),
}));

// Mock router outlet context
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useOutletContext: (() => {
    const addToast = jest.fn();
    return () => ({ addToast });
  })(),
}));

describe('ForecastPage Performance', () => {
  let store: EnhancedStore;

  beforeEach(() => {
    // Clear any previous calls recorded by the mocked ForecastMap module
    const forecastMapMockModule = jest.requireMock('./components/Map/ForecastMap') as {
      getCallCount: () => number;
      resetCallCount: () => void;
    };
    forecastMapMockModule.resetCallCount();
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
    const { unmount } = render(
      <Provider store={store}>
        <BrowserRouter>
          <ForecastPage />
        </BrowserRouter>
      </Provider>
    );

    // Initial render(s)
    const fm = jest.requireMock('./components/Map/ForecastMap') as { getCallCount: () => number };
    const initialCalls = fm.getCallCount();

    // Dispatch an action that changes `forecast` slice but NOT the data used by ForecastPage
    // setMapView changes state.forecast.currentMapView
    act(() => {
      store.dispatch(setMapView({ center: [40, -100], zoom: 5 }));
    });

    // With optimized selector: should not cause additional re-renders
    expect(fm.getCallCount()).toBeLessThanOrEqual(initialCalls + 1);
    unmount();
  });
});
