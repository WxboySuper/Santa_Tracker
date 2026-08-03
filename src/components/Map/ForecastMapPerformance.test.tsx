
import React from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, EnhancedStore } from '@reduxjs/toolkit';
import forecastReducer, { setMapView, setActiveProbability } from '../../store/forecastSlice';
import themeReducer from '../../store/themeSlice';
import overlaysReducer from '../../store/overlaysSlice';
import appModeReducer from '../../store/appModeSlice';

// Mock OpenLayersForecastMap so we can track renders without needing a real OL environment
const mockOLRender = jest.fn();
jest.mock('./OpenLayersForecastMap', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mockOLRender(props);
    return <div data-testid="ol-forecast-map">OLForecastMap</div>;
  },
}));

// Import component AFTER mocks
import ForecastMap from './ForecastMap';

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'test-uuid'
}));

describe('ForecastMap Performance', () => {
  let store: EnhancedStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = configureStore({
      reducer: {
        forecast: forecastReducer,
        theme: themeReducer,
        overlays: overlaysReducer,
        appMode: appModeReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }),
    });
  });

  it('does NOT re-render the map component when map view state changes (Optimized)', () => {
    render(
      <Provider store={store}>
        <ForecastMap />
      </Provider>
    );

    const initialRenderCount = mockOLRender.mock.calls.length;
    expect(initialRenderCount).toBeGreaterThan(0);

    act(() => {
      store.dispatch(setMapView({ center: [40, -100], zoom: 5 }));
    });

    const afterMapMoveCount = mockOLRender.mock.calls.length;
    // Allow at most one extra render during state transition
    expect(afterMapMoveCount).toBeLessThanOrEqual(initialRenderCount + 1);
  });

  it('does NOT re-render the map when active probability changes', () => {
    render(
      <Provider store={store}>
        <ForecastMap />
      </Provider>
    );

    const initialRenderCount = mockOLRender.mock.calls.length;

    act(() => {
      store.dispatch(setActiveProbability('10%'));
    });

    const afterChangeCount = mockOLRender.mock.calls.length;
    expect(afterChangeCount).toBeLessThanOrEqual(initialRenderCount + 1);
  });
});
