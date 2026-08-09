import { setWorkflowActive } from './forecastSlice';
import { store } from './index';
import { initializeStorePersistence } from './persistence';
import { setDarkMode } from './themeSlice';

describe('store persistence bootstrap', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    store.dispatch(setDarkMode(false));
    store.dispatch(setWorkflowActive(false));
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    localStorage.clear();
    document.documentElement.className = '';
  });

  test('hydrates and persists only when explicitly initialized', () => {
    localStorage.setItem('darkMode', 'true');
    localStorage.setItem('gfc-active-forecast-workflow', 'true');

    cleanup = initializeStorePersistence();

    expect(store.getState().theme.darkMode).toBe(true);
    expect(store.getState().forecast.isWorkflowActive).toBe(true);
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true);

    store.dispatch(setDarkMode(false));
    store.dispatch(setWorkflowActive(false));

    expect(localStorage.getItem('darkMode')).toBe('false');
    expect(localStorage.getItem('gfc-active-forecast-workflow')).toBeNull();
    expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
  });

  test('initialization is idempotent for one store', () => {
    const firstCleanup = initializeStorePersistence();
    const secondCleanup = initializeStorePersistence();

    expect(secondCleanup).toBe(firstCleanup);
    cleanup = firstCleanup;
  });
});
