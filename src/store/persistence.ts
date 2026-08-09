import { setWorkflowActive, WORKFLOW_ACTIVE_STORAGE_KEY } from './forecastSlice';
import { setDarkMode } from './themeSlice';
import { store } from './index';

const DARK_MODE_STORAGE_KEY = 'darkMode';
type AppStore = typeof store;
type Cleanup = () => void;

const initializedStores = new WeakMap<AppStore, Cleanup>();

const readStoredBoolean = (key: string): boolean => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
};

const writeStoredWorkflowActive = (isActive: boolean): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (isActive) {
      localStorage.setItem(WORKFLOW_ACTIVE_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(WORKFLOW_ACTIVE_STORAGE_KEY);
    }
  } catch {
    // Keep workflow state usable when storage is blocked.
  }
};

const writeStoredDarkMode = (darkMode: boolean): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(DARK_MODE_STORAGE_KEY, String(darkMode));
  } catch {
    // Keep the UI usable when storage is blocked.
  }
};

const applyDarkModeClass = (darkMode: boolean): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark-mode', darkMode);
};

/**
 * Installs browser persistence at the application entry point.
 *
 * Store modules remain import-safe: callers opt into hydration and persistence
 * explicitly, and repeated initialization for one store is idempotent.
 */
export const initializeStorePersistence = (targetStore: AppStore = store): Cleanup => {
  const existingCleanup = initializedStores.get(targetStore);
  if (existingCleanup) return existingCleanup;

  const storedDarkMode = readStoredBoolean(DARK_MODE_STORAGE_KEY);
  targetStore.dispatch(setDarkMode(storedDarkMode));
  applyDarkModeClass(storedDarkMode);

  let previousDarkMode = targetStore.getState().theme.darkMode;
  const unsubscribeTheme = targetStore.subscribe(() => {
    const darkMode = targetStore.getState().theme.darkMode;
    if (darkMode === previousDarkMode) return;
    previousDarkMode = darkMode;
    writeStoredDarkMode(darkMode);
    applyDarkModeClass(darkMode);
  });

  const storedWorkflowActive = readStoredBoolean(WORKFLOW_ACTIVE_STORAGE_KEY);
  targetStore.dispatch(setWorkflowActive(storedWorkflowActive));

  let previousWorkflowActive = targetStore.getState().forecast.isWorkflowActive;
  const unsubscribeWorkflow = targetStore.subscribe(() => {
    const isActive = targetStore.getState().forecast.isWorkflowActive;
    if (isActive === previousWorkflowActive) return;
    previousWorkflowActive = isActive;
    writeStoredWorkflowActive(isActive);
  });

  const cleanup = () => {
    unsubscribeTheme();
    unsubscribeWorkflow();
    initializedStores.delete(targetStore);
  };
  initializedStores.set(targetStore, cleanup);
  return cleanup;
};
