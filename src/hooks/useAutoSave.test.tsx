import React from 'react';
import { Provider } from 'react-redux';
import { act, render, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer, { setMapView, setCycleDate } from '../store/forecastSlice';
import { clearAutoSave, migrateLegacyAutoSave, pickNewestAutoSaveValue, selectPreferredAutoSaveValue, useAutoSave } from './useAutoSave';
import { serializeForecast } from '../utils/fileUtils';

jest.mock('../utils/fileUtils', () => ({
  serializeForecast: jest.fn(() => ({ serialized: true })),
}));

const Harness = () => {
  useAutoSave();
  return null;
};

const createStore = () =>
  configureStore({
    reducer: { forecast: forecastReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

describe('useAutoSave', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    (serializeForecast as jest.Mock).mockClear().mockReturnValue({ serialized: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('migrates the legacy anonymous autosave into a signed-in scope', () => {
    localStorage.setItem('forecastData', JSON.stringify({ legacy: true }));

    migrateLegacyAutoSave('user/1');

    expect(localStorage.getItem('forecastData')).toBeNull();
    expect(localStorage.getItem('forecastData:user-user%2F1')).toBe(JSON.stringify({ legacy: true }));
  });

  test('persists live in-memory edits instead of migrating a stale legacy snapshot', () => {
    localStorage.setItem('forecastData', JSON.stringify({ legacy: true, timestamp: '2026-07-13T00:00:00.000Z' }));

    migrateLegacyAutoSave('user-1', { live: true, unsaved: 'edit', timestamp: '2026-07-14T00:00:00.000Z' });

    expect(localStorage.getItem('forecastData')).toBeNull();
    expect(localStorage.getItem('forecastData:user-user-1')).toBe(JSON.stringify({ live: true, unsaved: 'edit', timestamp: '2026-07-14T00:00:00.000Z' }));
  });

  test('does not promote anonymous live state over an existing account autosave on sign-in', () => {
    localStorage.setItem('forecastData', JSON.stringify({ legacy: true, timestamp: '2026-07-14T12:00:00.000Z' }));
    localStorage.setItem('forecastData:user-user-1', JSON.stringify({ account: true, timestamp: '2026-07-13T12:00:00.000Z' }));

    migrateLegacyAutoSave('user-1', { live: true, timestamp: '2026-07-14T11:00:00.000Z' });

    expect(localStorage.getItem('forecastData')).toBe(JSON.stringify({ legacy: true, timestamp: '2026-07-14T12:00:00.000Z' }));
    expect(localStorage.getItem('forecastData:user-user-1')).toBe(JSON.stringify({ account: true, timestamp: '2026-07-13T12:00:00.000Z' }));
  });

  test('selectPreferredAutoSaveValue keeps account autosave over legacy copies', () => {
    const scoped = JSON.stringify({ account: true, timestamp: '2026-07-13T12:00:00.000Z' });
    const legacy = JSON.stringify({ legacy: true, timestamp: '2026-07-14T12:00:00.000Z' });

    expect(selectPreferredAutoSaveValue(scoped, legacy)).toBe(scoped);
    expect(selectPreferredAutoSaveValue(null, legacy)).toBe(legacy);
    expect(pickNewestAutoSaveValue(scoped, legacy, JSON.stringify({ live: true, timestamp: '2026-07-14T11:00:00.000Z' }))).toBe(legacy);
  });

  test('clears the active account autosave and legacy fallback for a fresh workflow', () => {
    localStorage.setItem('forecastData:user-user-1', JSON.stringify({ account: true }));
    localStorage.setItem('forecastData', JSON.stringify({ legacy: true }));

    clearAutoSave('user-1');

    expect(localStorage.getItem('forecastData:user-user-1')).toBeNull();
    expect(localStorage.getItem('forecastData')).toBeNull();
  });

  test('does not overwrite an existing signed-in autosave during migration', () => {
    localStorage.setItem('forecastData', JSON.stringify({ legacy: true }));
    localStorage.setItem('forecastData:user-user-1', JSON.stringify({ account: true }));

    migrateLegacyAutoSave('user-1');

    expect(localStorage.getItem('forecastData')).toBe(JSON.stringify({ legacy: true }));
    expect(localStorage.getItem('forecastData:user-user-1')).toBe(JSON.stringify({ account: true }));
  });

  test('skips initial render, then debounces forecast saves to localStorage', async () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <Harness />
      </Provider>
    );

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(serializeForecast).not.toHaveBeenCalled();

    act(() => {
      store.dispatch(setMapView({ center: [35, -97], zoom: 6 }));
    });

    await waitFor(() => {
      expect(serializeForecast).not.toHaveBeenCalled();
    });

    act(() => {
      jest.advanceTimersByTime(4999);
    });
    expect(localStorage.getItem('forecastData')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(localStorage.getItem('forecastData')).toBe(JSON.stringify({ serialized: true }));
  });

  test('clears pending saves and silently ignores serialization failures', async () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <Harness />
      </Provider>
    );

    (serializeForecast as jest.Mock).mockImplementation(() => {
      throw new Error('nope');
    });

    act(() => {
      store.dispatch(setCycleDate('2026-04-25'));
      store.dispatch(setCycleDate('2026-04-26'));
    });

    await waitFor(() => {
      expect(serializeForecast).not.toHaveBeenCalled();
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(serializeForecast).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('forecastData')).toBeNull();
  });
});
