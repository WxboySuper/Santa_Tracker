import '../immerSetup';
import { configureStore } from '@reduxjs/toolkit';
import { createSentryReduxEnhancer } from './sentryEnhancer';
import forecastReducer from './forecastSlice';
import overlaysReducer from './overlaysSlice';
import stormReportsReducer from './stormReportsSlice';
import appModeReducer from './appModeSlice';
import themeReducer from './themeSlice';
import verificationReducer from './verificationSlice';
import monitorReducer from './monitorSlice';

export const store = configureStore({
  reducer: {
    forecast: forecastReducer,
    overlays: overlaysReducer,
    stormReports: stormReportsReducer,
    appMode: appModeReducer,
    theme: themeReducer,
    verification: verificationReducer,
    monitor: monitorReducer,
  },
  enhancers: (getDefaultEnhancers) => {
    const defaults = getDefaultEnhancers();
    const sentryEnhancer = createSentryReduxEnhancer();
    return sentryEnhancer ? defaults.concat(sentryEnhancer) : defaults;
  },
  // Configure to handle Maps in Redux state - this allows for serialization of Map objects
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore Map objects in state (used for outlook data structures)
        // Use regex to match all days and outlook types
        ignoredPaths: [
          /^forecast\.forecastCycle\.days\.\d+\.data\.(categorical|tornado|wind|hail|totalSevere|day4-8)$/,
          /^forecast\.savedCycles\.\d+\.forecastCycle\.days\.\d+\.data\.(categorical|tornado|wind|hail|totalSevere|day4-8)$/,
          /^forecast\.historyByDay\.\d+\.(undoStack|redoStack)\.\d+\.snapshot\.data\.(categorical|tornado|wind|hail|totalSevere|day4-8)$/,
          /^verification\.loadedForecast\.days\.\d+\.data\.(categorical|tornado|wind|hail|totalSevere|day4-8)$/,
          'forecast.outlooks',
        ],
        ignoredActions: [
          'forecast/addFeature',
          'forecast/removeFeature',
          'forecast/importForecasts',
          'forecast/importForecastCycle',
          'forecast/loadCycleHistory',
          'forecast/loadSavedCycle',
          'forecast/restoreForecastCycle',
          'forecast/setOutlookMap',
          'forecast/applyAutoCategoricalSync',
          'forecast/resetCategorical',
          'forecast/undoLastEdit',
          'forecast/redoLastEdit',
          'verification/loadVerificationForecast',
        ],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
