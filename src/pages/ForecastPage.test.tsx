import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import ForecastPage, {
  buildMapView,
  buildRolloverSaveLabel,
  canToggleSignificantForState,
  clearStoredCloudSession,
  cycleHasDiscussionContent,
  dayHasAnyFeatures,
  formatRolloverDayLabel,
  getDayRolloverPromptState,
  getProbabilityList,
  getUndoRedoAction,
  hasAnyModifierKey,
  hasRestorableCloudSelection,
  hasRolloverForecastData,
  hasUnpublishedDiscussionDrafts,
  hasUnsavedRolloverCandidateSession,
  isTypingTarget,
  normalizeProbability,
  parseLoadedForecast,
  parseStoredCloudMeta,
  parseStoredForecastPayload,
  processShortcutKeyDown,
  runDayRolloverCloudSaveAction,
  runDayRolloverDownloadAction,
  readStoredDayValue,
  writeStoredDayValue,
} from './ForecastPage';
import forecastReducer from '../store/forecastSlice';
import { addCustomLayer, addFeature, updateDiscussionDraft } from '../store/forecastSlice';
import overlaysReducer from '../store/overlaysSlice';
import stormReportsReducer from '../store/stormReportsSlice';
import appModeReducer from '../store/appModeSlice';
import themeReducer from '../store/themeSlice';
import verificationReducer from '../store/verificationSlice';
import monitorReducer from '../store/monitorSlice';
import * as fileUtils from '../utils/fileUtils';
import { serializeForecast } from '../utils/fileUtils';
import { getLocalCalendarDate } from '../utils/localDate';
import type { Feature } from 'geojson';
import { CUSTOM_PRODUCT_HANDOFF_KEY } from '../lib/customProductHandoff';
import { CUSTOM_PRODUCT_LIMITS, CUSTOM_PRODUCTS_SCHEMA_VERSION } from '../types/customProducts';

const mockAddToast = jest.fn();
const mockUseAuth = jest.fn();
const mockUseEntitlement = jest.fn();

jest.mock('../components/Map/ForecastMap', () => {
  const { forwardRef } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: forwardRef(() => <div>ForecastMap Mock</div>),
  };
});

jest.mock('../components/ForecastWorkspace/ForecastWorkspaceLayouts', () => ({
  ForecastTabbedToolbarLayout: () => <div>ForecastTabbedToolbarLayout Mock</div>,
}));

jest.mock('../components/ForecastWorkspace/ForecastWorkspaceModals', () => () => null);

jest.mock('../hooks/useAutoSave', () => ({
  ...jest.requireActual('../hooks/useAutoSave'),
  useAutoSave: jest.fn(),
}));

jest.mock('../hooks/useAutoCategorical', () => jest.fn());
jest.mock('../utils/cycleHistoryPersistence', () => ({
  useCycleHistoryPersistence: jest.fn(),
}));
jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));
jest.mock('../billing/EntitlementProvider', () => ({
  useEntitlement: () => mockUseEntitlement(),
}));
jest.mock('../hooks/useCloudCycles', () => ({
  useCloudCycles: () => ({
    currentCloud: null,
    saveCycle: jest.fn(),
    markAsCurrent: jest.fn(),
    clearCurrent: jest.fn(),
  }),
}));
jest.mock('../hooks/useCloudSync', () => ({
  useCloudSync: () => ({
    markCurrentStateSynced: jest.fn(),
  }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useOutletContext: () => ({
    addToast: mockAddToast,
  }),
}));

const createStore = () => configureStore({
  reducer: {
    forecast: forecastReducer,
    overlays: overlaysReducer,
    stormReports: stormReportsReducer,
    appMode: appModeReducer,
    theme: themeReducer,
    verification: verificationReducer,
    monitor: monitorReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    serializableCheck: false,
    immutableCheck: false,
  }),
});


const renderForecastPage = (store: ReturnType<typeof createStore>) =>
  render(
    <MemoryRouter>
      <Provider store={store}>
        <ForecastPage />
      </Provider>
    </MemoryRouter>
  );


describe('ForecastPage layout selection', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockAddToast.mockClear();
    mockUseAuth.mockReturnValue({ user: null, syncedSettings: null });
    mockUseEntitlement.mockReturnValue({ premiumActive: false, effectiveSource: 'none' });
  });

  test('defaults to the tabbed toolbar layout when no local override is present', () => {
    const store = createStore();
    renderForecastPage(store);

    expect(screen.getByText('ForecastTabbedToolbarLayout Mock')).toBeInTheDocument();
  });

  test('consumes a validated reusable-product handoff into custom forecast state', async () => {
    mockUseEntitlement.mockReturnValue({ premiumActive: true, effectiveSource: 'stripe' });
    const store = createStore();
    const layer = {
      schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
      id: 'layer-reusable-1',
      label: 'Fire weather',
      order: 0,
      categories: [{
        id: 'elevated',
        label: 'Elevated',
        order: 0,
        style: { fillColor: '#f97316', fillOpacity: 0.45, strokeColor: '#123456', strokeOpacity: 0.4, strokeWidth: 4, hatch: 'crosshatch' },
      }],
      features: [],
      productSnapshot: {
        schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
        sourceProductId: 'product-reusable-1',
        sourceProductVersion: 1,
        label: 'Fire weather',
        categories: [{
          id: 'elevated',
          label: 'Elevated',
          order: 0,
          style: { fillColor: '#f97316', fillOpacity: 0.45, strokeColor: '#123456', strokeOpacity: 0.4, strokeWidth: 4, hatch: 'crosshatch' },
        }],
        capturedAt: '2026-07-17T12:00:00.000Z',
      },
      createdAt: '2026-07-17T12:00:00.000Z',
      updatedAt: '2026-07-17T12:00:00.000Z',
    };
    sessionStorage.setItem(CUSTOM_PRODUCT_HANDOFF_KEY, JSON.stringify(layer));

    renderForecastPage(store);

    await waitFor(() => expect(store.getState().forecast.forecastCycle.days[1]?.customLayers?.layers[0]?.label).toBe('Fire weather'));
    expect(store.getState().forecast.customEditor.mode).toBe('custom');
    expect(sessionStorage.getItem(CUSTOM_PRODUCT_HANDOFF_KEY)).toBeNull();
  });

  test('preserves a reusable-product handoff and reports the custom-layer limit', async () => {
    mockUseEntitlement.mockReturnValue({ premiumActive: true, effectiveSource: 'stripe' });
    const store = createStore();
    for (let index = 0; index < CUSTOM_PRODUCT_LIMITS.layersPerCollection; index += 1) {
      store.dispatch(addCustomLayer({
        schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
        id: `existing-layer-${index}` as never,
        label: `Existing layer ${index + 1}`,
        order: index,
        categories: [{
          id: `existing-category-${index}` as never,
          label: 'Existing category',
          order: 0,
          style: { fillColor: '#f97316', fillOpacity: 0.45, strokeColor: '#123456', strokeOpacity: 1, strokeWidth: 2, hatch: 'none' },
        }],
        features: [],
        createdAt: '2026-07-17T12:00:00.000Z',
        updatedAt: '2026-07-17T12:00:00.000Z',
      }));
    }
    const stagedLayer = {
      schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
      id: 'staged-layer' as never,
      label: 'Preserved product',
      order: 0,
      categories: [{
        id: 'staged-category' as never,
        label: 'Staged category',
        order: 0,
        style: { fillColor: '#f97316', fillOpacity: 0.45, strokeColor: '#123456', strokeOpacity: 1, strokeWidth: 2, hatch: 'none' as const },
      }],
      features: [],
      createdAt: '2026-07-17T12:00:00.000Z',
      updatedAt: '2026-07-17T12:00:00.000Z',
    };
    sessionStorage.setItem(CUSTOM_PRODUCT_HANDOFF_KEY, JSON.stringify(stagedLayer));

    renderForecastPage(store);

    await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith(
      `Remove a custom layer before loading this product (maximum ${CUSTOM_PRODUCT_LIMITS.layersPerCollection}).`,
      'error',
    ));
    expect(store.getState().forecast.forecastCycle.days[1]?.customLayers?.layers).toHaveLength(CUSTOM_PRODUCT_LIMITS.layersPerCollection);
    expect(JSON.parse(sessionStorage.getItem(CUSTOM_PRODUCT_HANDOFF_KEY) ?? 'null')).toEqual(stagedLayer);
    expect(store.getState().forecast.customEditor.mode).toBe('severe');
  });

  test('discards a staged reusable-product handoff if premium expired before forecast load', async () => {
    const store = createStore();
    sessionStorage.setItem(CUSTOM_PRODUCT_HANDOFF_KEY, JSON.stringify({ schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION, id: 'stale' }));
    renderForecastPage(store);
    await waitFor(() => expect(sessionStorage.getItem(CUSTOM_PRODUCT_HANDOFF_KEY)).toBeNull());
    expect(store.getState().forecast.forecastCycle.days[1]?.customLayers?.layers ?? []).toHaveLength(0);
  });

  test('query string or stored/remote overrides resolve to the tabbed toolbar when other variants are removed', () => {
    const store = createStore();
    localStorage.setItem('gfc-forecast-ui-variant', 'floating_panels');

    const first = render(
      <MemoryRouter initialEntries={['/forecast?forecastUi=workspace_dock']}>
        <Provider store={store}>
          <ForecastPage />
        </Provider>
      </MemoryRouter>
    );

    expect(screen.getByText('ForecastTabbedToolbarLayout Mock')).toBeInTheDocument();
    first.unmount();

    localStorage.setItem('gfc-forecast-ui-variant', 'floating_panels');
    const second = renderForecastPage(store);
    expect(screen.getByText('ForecastTabbedToolbarLayout Mock')).toBeInTheDocument();
    second.unmount();

    mockUseAuth.mockReturnValue({
      user: { uid: 'user-1' },
      syncedSettings: { forecastUiVariant: 'workspace_dock' },
    });

    const third = renderForecastPage(store);
    expect(screen.getByText('ForecastTabbedToolbarLayout Mock')).toBeInTheDocument();
    third.unmount();
  });

  test('does not overwrite active in-memory outlooks with an older local autosave on remount', () => {
    const store = createStore();
    const stalePayload = serializeForecast(store.getState().forecast.forecastCycle, { center: [39.8283, -98.5795], zoom: 4 });
    localStorage.setItem('forecastData', JSON.stringify(stalePayload));

    store.dispatch(addFeature({
      feature: {
        type: 'Feature',
        id: 'live-outlook',
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        },
        properties: {
          outlookType: 'tornado',
          probability: '2%',
          isSignificant: false,
        },
      },
    }));

    renderForecastPage(store);

    expect(store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('2%')?.[0].id).toBe('live-outlook');
  });

  test('does not overwrite in-memory discussion drafts with an older local autosave on remount', () => {
    const store = createStore();
    const stalePayload = serializeForecast(store.getState().forecast.forecastCycle, { center: [39.8283, -98.5795], zoom: 4 });
    localStorage.setItem('forecastData', JSON.stringify(stalePayload));

    store.dispatch(updateDiscussionDraft({
      scopeId: 'day-1',
      draft: {
        mode: 'diy',
        validStart: '2026-07-13T00:00',
        validEnd: '2026-07-14T00:00',
        forecasterName: 'Draft author',
        diyContent: 'Unsaved discussion draft',
        lastModified: '2026-07-13T00:00:00.000Z',
      },
    }));

    renderForecastPage(store);

    expect(store.getState().forecast.discussionDraftsByScope['day-1']?.diyContent).toBe('Unsaved discussion draft');
    expect(hasUnpublishedDiscussionDrafts(store.getState().forecast.discussionDraftsByScope)).toBe(true);
  });

  test('restores the local autosave when the current cycle is empty', () => {
    const store = createStore();
    const cycleWithOutlook = { ...store.getState().forecast.forecastCycle };
    const features = new Map<string, Feature[]>();
    features.set('10%', [{
      type: 'Feature',
      id: 'autosave-outlook',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: { outlookType: 'tornado', probability: '10%', isSignificant: false },
    } as Feature]);
    cycleWithOutlook.days = {
      1: {
        data: { tornado: features, wind: new Map(), hail: new Map(), categorical: new Map(), totalSevere: new Map() } as never,
        metadata: { lowProbabilityOutlooks: [] },
      },
    } as typeof cycleWithOutlook.days;
    const autosavePayload = serializeForecast(cycleWithOutlook, { center: [0, 0], zoom: 0 });
    localStorage.setItem('forecastData', JSON.stringify(autosavePayload));

    renderForecastPage(store);

    expect(store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('10%')?.[0].id).toBe('autosave-outlook');
  });

  test('keeps in-memory anonymous edits on sign-in without overwriting account autosave', async () => {
    const store = createStore();
    const stalePayload = serializeForecast(store.getState().forecast.forecastCycle, { center: [0, 0], zoom: 0 });
    stalePayload.timestamp = '2026-07-13T12:00:00.000Z';

    const anonymousCycle = { ...store.getState().forecast.forecastCycle };
    const features = new Map<string, Feature[]>();
    features.set('10%', [{
      type: 'Feature',
      id: 'anonymous-outlook',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: { outlookType: 'tornado', probability: '10%', isSignificant: false },
    } as Feature]);
    anonymousCycle.days = {
      1: {
        data: { tornado: features, wind: new Map(), hail: new Map(), categorical: new Map(), totalSevere: new Map() } as never,
        metadata: { lowProbabilityOutlooks: [] },
      },
    } as typeof anonymousCycle.days;
    const anonymousPayload = serializeForecast(anonymousCycle, { center: [0, 0], zoom: 0 });
    anonymousPayload.timestamp = '2026-07-14T12:00:00.000Z';

    localStorage.setItem('forecastData', JSON.stringify(anonymousPayload));
    localStorage.setItem('forecastData:user-user-1', JSON.stringify(stalePayload));

    mockUseAuth.mockReturnValue({ user: null, syncedSettings: null });
    const view = render(
      <MemoryRouter>
        <Provider store={store}>
          <ForecastPage />
        </Provider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('10%')?.[0].id).toBe('anonymous-outlook');
    });

    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' }, syncedSettings: null });
    view.rerender(
      <MemoryRouter>
        <Provider store={store}>
          <ForecastPage />
        </Provider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(store.getState().forecast.forecastCycle.days[1]?.data.tornado?.get('10%')?.[0].id).toBe('anonymous-outlook');
      expect(localStorage.getItem('forecastData')).toBe(JSON.stringify(anonymousPayload));
      expect(localStorage.getItem('forecastData:user-user-1')).toBe(JSON.stringify(stalePayload));
    });
  });

  test('waits for restored session state before committing the local-day baseline', async () => {
    const sourceStore = createStore();
    sourceStore.dispatch(addFeature({
      feature: {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {},
      },
    }));
    localStorage.setItem('forecastData', JSON.stringify(serializeForecast(
      sourceStore.getState().forecast.forecastCycle,
      sourceStore.getState().forecast.currentMapView,
    )));
    const today = getLocalCalendarDate();
    const previousDay = getLocalCalendarDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
    localStorage.setItem('gfc-last-active-local-day', previousDay);

    renderForecastPage(createStore());

    await waitFor(() => expect(screen.getByText('New day detected')).toBeInTheDocument());
    expect(localStorage.getItem('gfc-last-active-local-day:anonymous')).toBe(today);
    expect(screen.getByRole('button', { name: 'Download a copy & start new day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace without saving' })).toBeInTheDocument();
  });
});

describe('ForecastPage helpers', () => {
  test('exposes probability lists and significant toggle rules', () => {
    expect(getProbabilityList('categorical')).toContain('HIGH');
    expect(getProbabilityList('tornado')).toContain('60%');
    expect(getProbabilityList('wind')).toEqual(getProbabilityList('hail'));
    expect(getProbabilityList('unknown')).toEqual([]);
    expect(normalizeProbability('10#')).toBe('10%');

    expect(canToggleSignificantForState('categorical', 'HIGH')).toBe(false);
    expect(canToggleSignificantForState('tornado', '5%')).toBe(false);
    expect(canToggleSignificantForState('tornado', '10%')).toBe(true);
    expect(canToggleSignificantForState('wind', '5%')).toBe(false);
    expect(canToggleSignificantForState('hail', '15%')).toBe(true);
  });

  test('handles rollover labels, storage helpers, and session metadata parsing', () => {
    writeStoredDayValue('test-day', '2026-04-24');
    expect(readStoredDayValue('test-day')).toBe('2026-04-24');
    expect(buildRolloverSaveLabel('2026-04-24')).toContain('Apr 24');
    expect(buildRolloverSaveLabel('not-a-date')).toContain('not-a-date');
    expect(formatRolloverDayLabel('2026-04-24')).toContain('April 24');
    expect(formatRolloverDayLabel('bad-date')).toBe('bad-date');

    expect(parseStoredForecastPayload(null)).toBeNull();
    expect(parseStoredForecastPayload('not-json')).toBeNull();
    expect(parseStoredForecastPayload(JSON.stringify({ nope: true }))).toBeNull();

    expect(parseStoredCloudMeta(null)).toBeNull();
    expect(parseStoredCloudMeta('not-json')).toBeNull();
    expect(parseStoredCloudMeta('{"id":"abc","label":"Cycle"}')).toEqual({ id: 'abc', label: 'Cycle' });
    expect(hasRestorableCloudSelection({ id: 'abc', label: 'Cycle' })).toBe(true);
    expect(hasRestorableCloudSelection({ id: 'abc' })).toBe(false);

    sessionStorage.setItem('cloudCyclePayload', 'payload');
    sessionStorage.setItem('cloudCycleMeta', 'meta');
    clearStoredCloudSession();
    expect(sessionStorage.getItem('cloudCyclePayload')).toBeNull();
    expect(sessionStorage.getItem('cloudCycleMeta')).toBeNull();
  });

  test('recovers a pending rollover prompt after session restore marks the cycle saved', () => {
    const emptyCycle = createStore().getState().forecast.forecastCycle;
    const pending = { previousDay: '2026-04-23', currentDay: '2026-04-24' };
    expect(getDayRolloverPromptState({
      restoreComplete: true,
      lastActiveDay: '2026-04-24',
      today: '2026-04-24',
      alreadyPromptedToday: true,
      pendingPrompt: pending,
      promptOpen: false,
      forecastCycle: emptyCycle,
      isSaved: true,
    })).toEqual(pending);
  });

  test('covers rollover download and cloud-save success and failure paths', async () => {
    const forecastCycle = createStore().getState().forecast.forecastCycle;
    const mapView = { center: [0, 0] as [number, number], zoom: 4 };
    const dispatch = jest.fn();
    const clearCurrent = jest.fn();
    const exportSpy = jest.spyOn(fileUtils, 'exportForecastToJson').mockImplementation(() => undefined);

    expect(runDayRolloverDownloadAction({ forecastCycle, mapView, dispatch })).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    exportSpy.mockImplementationOnce(() => { throw new Error('download failed'); });
    dispatch.mockClear();
    expect(runDayRolloverDownloadAction({ forecastCycle, mapView, dispatch })).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();

    const saveCycle = jest.fn().mockResolvedValue(true);
    dispatch.mockClear();
    expect(await runDayRolloverCloudSaveAction({ forecastCycle, currentMapView: mapView, saveCycle, clearCurrent, dispatch })).toBe(true);
    expect(saveCycle).toHaveBeenCalledWith(expect.stringContaining('Rollover save'), forecastCycle.cycleDate, expect.any(Object), expect.any(Object), undefined, { saveAsNew: true });
    expect(clearCurrent).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);

    saveCycle.mockResolvedValueOnce(false);
    clearCurrent.mockClear();
    dispatch.mockClear();
    expect(await runDayRolloverCloudSaveAction({ forecastCycle, currentMapView: mapView, saveCycle, clearCurrent, dispatch })).toBe(false);
    expect(clearCurrent).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    exportSpy.mockRestore();
  });

  test('detects rollover candidates, map view fallbacks, keyboard targets, and undo/redo keys', () => {
    const emptyCycle = createStore().getState().forecast.forecastCycle;
    expect(hasRolloverForecastData(emptyCycle)).toBe(false);
    expect(cycleHasDiscussionContent(emptyCycle)).toBe(false);
    expect(hasUnsavedRolloverCandidateSession(emptyCycle, true)).toBe(false);

    const cycleWithDiscussion = {
      ...emptyCycle,
      days: {
        ...emptyCycle.days,
        1: { ...emptyCycle.days[1], discussion: 'A discussion' },
      },
    };
    expect(cycleHasDiscussionContent(cycleWithDiscussion)).toBe(true);
    expect(hasUnsavedRolloverCandidateSession(cycleWithDiscussion, false)).toBe(true);

    expect(buildMapView({ current: null })).toEqual({ center: [39.8283, -98.5795], zoom: 4 });
    expect(buildMapView({ current: { getView: () => ({ center: [1, 2], zoom: 8 }) } as never })).toEqual({
      center: [1, 2],
      zoom: 8,
    });

    expect(dayHasAnyFeatures(null)).toBe(false);
    expect(dayHasAnyFeatures({ tornado: new Map([['5%', [{}]]]) })).toBe(true);
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);

    expect(hasAnyModifierKey(new KeyboardEvent('keydown', { ctrlKey: true }))).toBe(true);
    expect(hasAnyModifierKey(new KeyboardEvent('keydown'))).toBe(false);
    expect(getUndoRedoAction(new KeyboardEvent('keydown', { ctrlKey: true }), 'z')).toBe('undo');
    expect(getUndoRedoAction(new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true }), 'z')).toBe('redo');
    expect(getUndoRedoAction(new KeyboardEvent('keydown', { metaKey: true }), 'y')).toBe('redo');
    expect(getUndoRedoAction(new KeyboardEvent('keydown'), 'z')).toBeNull();
  });

  test('parses loaded forecast files with clear failure toasts', async () => {
    const addToast = jest.fn();
    const makeTextFile = (text: string) => ({ text: jest.fn().mockResolvedValue(text) } as unknown as File);

    await expect(parseLoadedForecast(makeTextFile('not json'), addToast)).resolves.toBeNull();
    expect(addToast).toHaveBeenCalledWith('File is not valid JSON.', 'error');

    await expect(parseLoadedForecast(makeTextFile(JSON.stringify({ nope: true })), addToast)).resolves.toBeNull();
    expect(addToast).toHaveBeenCalledWith('Invalid forecast data format.', 'error');
  });

  test('routes keyboard shortcuts through command and standard handlers', () => {
    const dispatch = jest.fn();
    const addToast = jest.fn();
    const handleSave = jest.fn();
    const fileInput = document.createElement('input');
    fileInput.click = jest.fn();
    const mapAdapter = { getMap: jest.fn() };
    const context = {
      dispatch,
      addToast,
      isSaved: false,
      canUndo: true,
      canRedo: true,
      handleSave,
      fileInputRef: { current: fileInput },
      mapRef: { current: mapAdapter },
      currentDay: 1,
      activeOutlookType: 'tornado' as const,
      activeProbability: '10%',
      isSignificant: false,
    };

    const ctrlS = new KeyboardEvent('keydown', { key: 's', ctrlKey: true });
    processShortcutKeyDown(ctrlS, context);
    expect(handleSave).toHaveBeenCalledTimes(1);

    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true }), context);
    expect(fileInput.click).toHaveBeenCalledTimes(1);

    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'e', ctrlKey: true }), context);
    expect(mapAdapter.getMap).toHaveBeenCalledTimes(1);

    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }), context);
    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }), context);
    expect(dispatch).toHaveBeenCalledTimes(2);

    processShortcutKeyDown(new KeyboardEvent('keydown', { key: '2' }), context);
    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'w' }), context);
    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 's' }), context);
    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp' }), context);
    expect(addToast).toHaveBeenCalledWith('Switched to Day 2', 'info');
    expect(addToast).toHaveBeenCalledWith('Switched to Wind outlook', 'info');
    expect(addToast).toHaveBeenCalledWith('Enabled significant threat', 'info');
    expect(addToast).toHaveBeenCalledWith('Increased to 15%', 'info');

    processShortcutKeyDown(new KeyboardEvent('keydown', { key: 'g' }), {
      ...context,
      activeOutlookType: 'categorical',
      activeProbability: 'MRGL',
    });
    expect(addToast).toHaveBeenCalledWith('Added General Thunderstorm risk', 'info');

    const inputEvent = new KeyboardEvent('keydown', { key: '3' });
    Object.defineProperty(inputEvent, 'target', { value: document.createElement('input') });
    processShortcutKeyDown(inputEvent, context);
    expect(addToast).not.toHaveBeenCalledWith('Switched to Day 3', 'info');
  });

  it('ignores keydown events when the browser omits KeyboardEvent.key', () => {
    const dispatch = jest.fn();
    const addToast = jest.fn();
    const handleSave = jest.fn();
    const context = {
      dispatch,
      addToast,
      isSaved: false,
      canUndo: false,
      canRedo: false,
      handleSave,
      fileInputRef: { current: null },
      mapRef: { current: null },
      currentDay: 1,
      activeOutlookType: 'tornado' as const,
      activeProbability: '10%',
      isSignificant: false,
    };

    const event = new KeyboardEvent('keydown', { bubbles: true });
    Object.defineProperty(event, 'key', { value: undefined });

    expect(() => processShortcutKeyDown(event, context)).not.toThrow();
    expect(handleSave).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(addToast).not.toHaveBeenCalled();
  });
});
