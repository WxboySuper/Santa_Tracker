import '../immerSetup';
import { configureStore } from '@reduxjs/toolkit';
import { createSentryReduxEnhancer } from './sentryEnhancer';
import { createTimestampMiddleware } from './timestampMiddleware';
import forecastReducer, { setWorkflowActive, WORKFLOW_ACTIVE_STORAGE_KEY } from './forecastSlice';
import overlaysReducer from './overlaysSlice';
import stormReportsReducer from './stormReportsSlice';
import appModeReducer from './appModeSlice';
import themeReducer, { setDarkMode } from './themeSlice';
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
    }).concat(createTimestampMiddleware() as never),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

/**
 * Theme persistence lives outside the reducer so Redux state transitions stay
 * free of storage/DOM side effects. Hydration and document-class sync happen
 * here instead of inside reducers.
 */
const DARK_MODE_STORAGE_KEY = 'darkMode';

const readStoredDarkMode = (): boolean => {
  try {
    return localStorage.getItem(DARK_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const applyDarkModeClass = (darkMode: boolean) => {
  if (darkMode) {
    document.documentElement.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
  }
};

const storedDarkMode = readStoredDarkMode();
store.dispatch(setDarkMode(storedDarkMode));
applyDarkModeClass(storedDarkMode);

let previousDarkMode = store.getState().theme.darkMode;
store.subscribe(() => {
  const darkMode = store.getState().theme.darkMode;
  if (darkMode === previousDarkMode) {
    return;
  }
  previousDarkMode = darkMode;
  try {
    localStorage.setItem(DARK_MODE_STORAGE_KEY, String(darkMode));
  } catch {
    // Keep the UI usable when storage is blocked.
  }
  applyDarkModeClass(darkMode);
});

/**
 * The workflow-active flag is persisted here instead of inside reducers so
 * state transitions stay free of storage side effects. The initial value is
 * hydrated once at startup and re-synced whenever the reducer updates it.
 */
const readStoredWorkflowActive = (): boolean => {
  try {
    return localStorage.getItem(WORKFLOW_ACTIVE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const writeStoredWorkflowActive = (isActive: boolean) => {
  try {
    if (isActive) {
      localStorage.setItem(WORKFLOW_ACTIVE_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(WORKFLOW_ACTIVE_STORAGE_KEY);
    }
  } catch {
    // Keep workflow state usable when storage is blocked.
  }
};

store.dispatch(setWorkflowActive(readStoredWorkflowActive()));
let previousWorkflowActive = store.getState().forecast.isWorkflowActive;
store.subscribe(() => {
  const isActive = store.getState().forecast.isWorkflowActive;
  if (isActive === previousWorkflowActive) {
    return;
  }
  previousWorkflowActive = isActive;
  writeStoredWorkflowActive(isActive);
});
