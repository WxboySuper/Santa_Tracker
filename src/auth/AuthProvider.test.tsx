import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  applySettingsToState,
  areOverlaySettingsEqual,
  areUserSettingsEqual,
  asRecord,
  canSyncHostedUserDocuments,
  clearDeletedAccountSession,
  createProfilePayload,
  createSettingsSnapshot,
  disabledAuthAction,
  extractLocalUserFromData,
  getDefaultContextValue,
  getRemoteSeedPayload,
  getSettingsSyncError,
  getSettingsUpdateError,
  initLocalAuthState,
  localRefreshBetaAccess,
  localSignInWithEmail,
  localSignOutUser,
  localSignUpWithEmail,
  localUpdateSyncedSettings,
  postLocalJson,
  readProfileBetaAccess,
  runInitialHostedSync,
  readRemoteSettings,
  safeParseJson,
  seedOrApplySettings,
  startSettingsSubscription,
  syncProfileDocument,
  AuthProvider,
  useAuth,
} from './AuthProvider';
import themeReducer from '../store/themeSlice';
import overlaysReducer from '../store/overlaysSlice';
import monitorReducer from '../store/monitorSlice';
import { DEFAULT_MONITOR_SETTINGS } from '../monitor/types';

interface MockResponse {
  ok: boolean;
  json: () => Promise<Record<string, unknown>>;
  text: () => Promise<string>;
}

// Mock lib/firebase
jest.mock('../lib/firebase', () => ({
  auth: null,
  db: null,
  googleAuthProvider: {},
  isHostedAuthEnabled: false,
  requireAuth: jest.fn(),
  requireDb: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...path) => ({ path })),
  getDoc: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(() => ({ __serverTimestamp: true })),
  setDoc: jest.fn(),
}));

// Mock productMetrics
jest.mock('../utils/productMetrics', () => ({
  queueProductMetric: jest.fn(),
}));

const createMockStore = () => configureStore({
  reducer: {
    theme: themeReducer,
    overlays: overlaysReducer,
    monitor: monitorReducer,
  },
});

const renderAuthHookWithStore = (store: ReturnType<typeof createMockStore>) =>
  renderHook(() => useAuth(), {
    wrapper: ({ children }) => (
      <Provider store={store}>
        <AuthProvider>{children}</AuthProvider>
      </Provider>
    ),
  });

const waitForAuthEffects = async (delay = 100) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, delay));
  });
};

describe('AuthProvider Utils', () => {
  test('local sign-out failure does not turn completed server deletion into a failure', async () => {
    const clearLocalState = jest.fn();
    await expect(clearDeletedAccountSession(
      async () => { throw new Error('local storage unavailable'); },
      clearLocalState,
    ))
      .resolves.toBeUndefined();
    expect(clearLocalState).toHaveBeenCalledTimes(1);
  });

  test('safeParseJson parses valid JSON', async () => {
    const data = { foo: 'bar' };
    const resp = { ok: true, json: jest.fn().mockResolvedValue(data) } as MockResponse;
    const result = await safeParseJson<{ foo: string }>(resp as unknown as Response);
    expect(result).toEqual(data);
  });

  test('safeParseJson returns null on invalid JSON', async () => {
    const resp = { ok: false, json: jest.fn().mockRejectedValue(new Error('invalid json')) } as MockResponse;
    const result = await safeParseJson(resp as unknown as Response);
    expect(result).toBeNull();
  });

  test('asRecord coerces objects', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord(null)).toEqual({});
    expect(asRecord('string')).toEqual({});
  });

  test('extractLocalUserFromData works', () => {
    const data = { uid: 'user123', email: 'test@example.com', displayName: 'Test User' };
    const user = extractLocalUserFromData(data);
    expect(user.uid).toBe('user123');
    expect(user.email).toBe('test@example.com');
    expect(user.displayName).toBe('Test User');
  });

  test('createSettingsSnapshot builds correct object', () => {
    const overlays = {
      baseMapStyle: 'streets',
      stateBorders: true,
      counties: false,
      ghostOutlooks: {},
    };
    const result = createSettingsSnapshot({
      darkMode: true,
      overlays,
      defaultForecasterName: 'Forecaster',
      forecastUiVariant: 'workspace_dock',
    });
    expect(result).toEqual({
      darkMode: true,
      baseMapStyle: 'streets',
      stateBorders: true,
      counties: false,
      ghostOutlooks: {},
      defaultForecasterName: 'Forecaster',
      forecastUiVariant: 'workspace_dock',
      monitorSettings: DEFAULT_MONITOR_SETTINGS,
    });
  });

  test('readRemoteSettings validates data', () => {
    const validSettings = {
      darkMode: true,
      baseMapStyle: 'streets',
      stateBorders: true,
      counties: false,
      ghostOutlooks: {},
      defaultForecasterName: 'Forecaster',
      forecastUiVariant: 'workspace_dock' as const,
      monitorSettings: DEFAULT_MONITOR_SETTINGS,
    };
    expect(readRemoteSettings(validSettings)).toEqual(validSettings);
    expect(readRemoteSettings({ darkMode: 'not boolean' } as Record<string, unknown>)).toBeNull();
    expect(readRemoteSettings()).toBeNull();
  });

  test('settings comparison and application helpers avoid redundant dispatches', () => {
    const overlays = {
      baseMapStyle: 'osm' as const,
      stateBorders: true,
      counties: false,
      ghostOutlooks: {
        tornado: false,
        wind: false,
        hail: false,
        categorical: false,
        totalSevere: false,
        'day4-8': false,
      },
    };
    const settings = createSettingsSnapshot({
      darkMode: false,
      overlays,
      defaultForecasterName: 'Forecaster',
      forecastUiVariant: 'workspace_dock',
    });

    expect(areUserSettingsEqual(null, null)).toBe(true);
    expect(areUserSettingsEqual(settings, { ...settings })).toBe(true);
    expect(areUserSettingsEqual(settings, { ...settings, counties: true })).toBe(false);
    expect(areOverlaySettingsEqual(overlays, settings)).toBe(true);
    expect(areOverlaySettingsEqual({ ...overlays, counties: true }, settings)).toBe(false);

    const dispatch = jest.fn();
    const setSyncedSettings = jest.fn();
    const lastSyncedSettingsRef = { current: null };
    applySettingsToState(
      { ...settings, darkMode: true, counties: true },
      {
        currentDarkModeRef: { current: false },
        currentOverlaysRef: { current: overlays },
        dispatch,
        setSyncedSettings,
        lastSyncedSettingsRef,
      }
    );

    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(setSyncedSettings).toHaveBeenCalledWith(expect.objectContaining({ darkMode: true, counties: true }));

    expect(lastSyncedSettingsRef.current).not.toBeNull();
    const syncedSettings = lastSyncedSettingsRef.current;
    if (!syncedSettings) {
      throw new Error('Expected synced settings to be populated');
    }
    applySettingsToState(syncedSettings, {
      currentDarkModeRef: { current: true },
      currentOverlaysRef: { current: { ...overlays, counties: true } },
      dispatch,
      setSyncedSettings,
      lastSyncedSettingsRef,
    });
    expect(setSyncedSettings).toHaveBeenCalledTimes(1);
  });

  test('local post helper and auth utility fallbacks normalize errors', async () => {
    expect(() => disabledAuthAction()).toThrow(/Hosted accounts are not enabled/);
    expect(getDefaultContextValue()).toEqual(expect.objectContaining({ status: 'disabled', hostedAuthEnabled: false }));
    expect(canSyncHostedUserDocuments(null)).toBe(false);
    expect(readProfileBetaAccess({ betaAccess: true })).toBe(true);
    expect(readProfileBetaAccess()).toBe(false);
    expect(getSettingsUpdateError(new Error('Update failed'))).toBe('Update failed');
    expect(getSettingsUpdateError('bad')).toBe('Unable to update synced settings right now.');
    expect(getSettingsSyncError(new Error('Sync failed'))).toBe('Sync failed');
    expect(getSettingsSyncError('bad')).toBe('Unable to sync account settings right now.');

    const profilePayload = createProfilePayload({
      email: null,
      displayName: 'Tester',
      photoURL: null,
      providerData: [{ providerId: 'password' }],
    } as never);
    expect(profilePayload).toEqual(expect.objectContaining({ email: '', displayName: 'Tester', providers: ['password'] }));

    const seed = getRemoteSeedPayload(
      {
        darkMode: false,
        baseMapStyle: 'osm',
        stateBorders: true,
        counties: false,
        ghostOutlooks: {},
        defaultForecasterName: '',
        forecastUiVariant: 'workspace_dock',
        monitorSettings: DEFAULT_MONITOR_SETTINGS,
      },
      { includeCreatedAt: true }
    );
    expect(seed).toEqual(expect.objectContaining({ updatedAt: expect.anything(), createdAt: expect.anything() }));

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    await expect(postLocalJson('/api/local/test', { body: { ok: true }, failureMessage: 'Failed' })).resolves.toEqual({ ok: true });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: 'Nope' }),
    });
    await expect(postLocalJson('/api/local/test', { failureMessage: 'Failed' })).rejects.toThrow('Nope');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new Error('invalid')),
    });
    await expect(postLocalJson('/api/local/test', { failureMessage: 'Failed' })).resolves.toEqual({});
  });

  test('local auth action helpers update state and surface failures', async () => {
    const overlays = {
      baseMapStyle: 'osm' as const,
      stateBorders: true,
      counties: false,
      ghostOutlooks: {},
    };
    const deps = {
      dispatch: jest.fn(),
      currentDarkModeRef: { current: false },
      currentOverlaysRef: { current: overlays },
      setUser: jest.fn(),
      setStatus: jest.fn(),
      setSyncedSettings: jest.fn(),
      setSettingsSyncStatus: jest.fn(),
      lastSyncedSettingsRef: { current: null },
      setBetaAccess: jest.fn(),
      setBetaAccessLoading: jest.fn(),
      setError: jest.fn(),
    };

    const localPayload = {
      uid: 'user-1',
      email: 'user@example.com',
      betaAccess: true,
      settings: {
        darkMode: false,
        baseMapStyle: 'osm',
        stateBorders: true,
        counties: false,
        ghostOutlooks: {},
        defaultForecasterName: 'Local',
        forecastUiVariant: 'workspace_dock',
        monitorSettings: DEFAULT_MONITOR_SETTINGS,
      },
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(localPayload),
    });
    await localSignInWithEmail({ email: 'user@example.com', password: 'secret' }, deps);
    expect(global.fetch).toHaveBeenCalledWith('/api/local/signin', expect.objectContaining({ method: 'POST' }));
    expect(deps.setStatus).toHaveBeenCalledWith('signed_in');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: 'Bad password' }),
    });
    await expect(localSignInWithEmail({ email: 'user@example.com', password: 'bad' }, deps)).rejects.toThrow('Bad password');
    expect(deps.setError).toHaveBeenCalledWith('Bad password');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(localPayload),
    });
    await localSignUpWithEmail({ email: 'new@example.com', password: 'secret' }, deps);
    expect(global.fetch).toHaveBeenCalledWith('/api/local/signup', expect.objectContaining({ method: 'POST' }));

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await localSignOutUser(deps);
    expect(deps.setUser).toHaveBeenCalledWith(null);
    expect(deps.setStatus).toHaveBeenCalledWith('signed_out');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ betaAccess: true }),
    });
    await localRefreshBetaAccess(deps);
    expect(deps.setBetaAccess).toHaveBeenCalledWith(true);

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    await localRefreshBetaAccess(deps);
    expect(deps.setBetaAccess).toHaveBeenCalledWith(false);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ settings: localPayload.settings }),
    });
    await localUpdateSyncedSettings({ defaultForecasterName: 'Updated' }, deps);
    expect(deps.setSettingsSyncStatus).toHaveBeenCalledWith('synced');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: 'Update failed' }),
    });
    await expect(localUpdateSyncedSettings({ defaultForecasterName: 'Nope' }, deps)).rejects.toThrow('Update failed');
    expect(deps.setError).toHaveBeenCalledWith('Update failed');
  });

  test('initializes local auth from profile success, inactive state, and failures', async () => {
    const makeDeps = (isActive = () => true) => ({
      isActive,
      dispatch: jest.fn(),
      currentDarkModeRef: { current: false },
      currentOverlaysRef: {
        current: {
          baseMapStyle: 'osm' as const,
          stateBorders: true,
          counties: false,
          ghostOutlooks: {},
        },
      },
      setUser: jest.fn(),
      setStatus: jest.fn(),
      setSettingsSyncStatus: jest.fn(),
      setSyncedSettings: jest.fn(),
      lastSyncedSettingsRef: { current: null },
      setError: jest.fn(),
      setBetaAccess: jest.fn(),
      setBetaAccessLoading: jest.fn(),
    });

    const profile = {
      uid: 'local-user',
      email: 'local@example.com',
      betaAccess: true,
      settings: {
        darkMode: false,
        baseMapStyle: 'osm',
        stateBorders: true,
        counties: false,
        ghostOutlooks: {},
        defaultForecasterName: 'Local',
        forecastUiVariant: 'workspace_dock',
        monitorSettings: DEFAULT_MONITOR_SETTINGS,
      },
    };

    const successDeps = makeDeps();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(profile),
    });
    await initLocalAuthState(successDeps);
    expect(successDeps.setUser).toHaveBeenCalledWith(expect.objectContaining({ uid: 'local-user' }));
    expect(successDeps.setStatus).toHaveBeenCalledWith('signed_in');
    expect(successDeps.setSettingsSyncStatus).toHaveBeenCalledWith('synced');
    expect(successDeps.setBetaAccess).toHaveBeenCalledWith(true);

    const inactiveDeps = makeDeps(() => false);
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(profile),
    });
    await initLocalAuthState(inactiveDeps);
    expect(inactiveDeps.setUser).not.toHaveBeenCalled();

    const signedOutDeps = makeDeps();
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    await initLocalAuthState(signedOutDeps);
    expect(signedOutDeps.setStatus).toHaveBeenCalledWith('signed_out');
    expect(signedOutDeps.setSettingsSyncStatus).toHaveBeenCalledWith('idle');
    expect(signedOutDeps.setBetaAccessLoading).toHaveBeenCalledWith(false);

    const errorDeps = makeDeps();
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await initLocalAuthState(errorDeps);
    expect(errorDeps.setStatus).toHaveBeenCalledWith('error');
    expect(errorDeps.setError).toHaveBeenCalledWith('offline');
  });

  test('hosted sync helpers seed, apply, subscribe, and normalize errors', async () => {
    const settings = {
      darkMode: false,
      baseMapStyle: 'osm' as const,
      stateBorders: true,
      counties: false,
      ghostOutlooks: {},
      defaultForecasterName: 'Remote',
      forecastUiVariant: 'workspace_dock' as const,
      monitorSettings: DEFAULT_MONITOR_SETTINGS,
    };
    const getDocSpy = jest.mocked(getDoc);
    const setDocSpy = jest.mocked(setDoc).mockResolvedValue(undefined as never);
    const onSnapshotSpy = jest.mocked(onSnapshot);

    getDocSpy.mockResolvedValueOnce({
      exists: () => false,
    } as never);
    await syncProfileDocument({ path: 'profile' } as never, {
      email: 'user@example.com',
      displayName: 'User',
      photoURL: '',
      providerData: [],
    } as never);
    expect(setDocSpy).toHaveBeenCalledWith(
      { path: 'profile' },
      expect.objectContaining({ email: 'user@example.com', createdAt: expect.anything() }),
      { merge: true }
    );

    const applyRemoteSettings = jest.fn();
    const setSyncedSettings = jest.fn();
    const lastSyncedSettingsRef = { current: null };
    await seedOrApplySettings({
      settingsRef: { path: 'settings' } as never,
      settingsSnapshot: { data: () => settings, exists: () => true } as never,
      localSettings: { ...settings, defaultForecasterName: 'Local' },
      applyRemoteSettings,
      isActive: () => true,
      lastSyncedSettingsRef,
      setSyncedSettings,
    });
    expect(applyRemoteSettings).toHaveBeenCalledWith(settings);

    await seedOrApplySettings({
      settingsRef: { path: 'settings' } as never,
      settingsSnapshot: { data: () => undefined, exists: () => false } as never,
      localSettings: settings,
      applyRemoteSettings,
      isActive: () => true,
      lastSyncedSettingsRef,
      setSyncedSettings,
    });
    expect(setDocSpy).toHaveBeenCalledWith(
      { path: 'settings' },
      expect.objectContaining({ defaultForecasterName: 'Remote', createdAt: expect.anything() }),
      { merge: true }
    );
    expect(setSyncedSettings).toHaveBeenCalledWith(settings);

    let snapshotHandler: ((snapshot: { data: () => typeof settings }) => void) | null = null;
    let errorHandler: ((error: Error) => void) | null = null;
    const unsubscribe = jest.fn();
    onSnapshotSpy.mockImplementation((ref, next, error) => {
      snapshotHandler = next as typeof snapshotHandler;
      errorHandler = error as typeof errorHandler;
      return unsubscribe;
    });
    const setSettingsSyncStatus = jest.fn();
    const setError = jest.fn();
    const subscription = startSettingsSubscription({
      settingsRef: { path: 'settings' } as never,
      isActive: () => true,
      applyRemoteSettings,
      setSettingsSyncStatus,
      setError,
    });
    expect(snapshotHandler).not.toBeNull();
    if (!snapshotHandler) {
      throw new Error('Expected snapshot handler to be registered');
    }
    snapshotHandler({ data: () => settings });
    expect(setSettingsSyncStatus).toHaveBeenCalledWith('synced');
    expect(errorHandler).not.toBeNull();
    if (!errorHandler) {
      throw new Error('Expected error handler to be registered');
    }
    errorHandler(new Error('listener failed'));
    expect(setError).toHaveBeenCalledWith('listener failed');
    subscription();
    expect(unsubscribe).toHaveBeenCalled();

    getDocSpy
      .mockResolvedValueOnce({ exists: () => true } as never)
      .mockResolvedValueOnce({ data: () => undefined, exists: () => false } as never);
    const hasInitializedSettingsRef = { current: false };
    const unsubscribeResult = await runInitialHostedSync({
      profileRef: { path: 'profile' } as never,
      settingsRef: { path: 'settings' } as never,
      user: { uid: 'user-1', email: 'user@example.com', displayName: 'User', photoURL: '', providerData: [] } as never,
      buildLocalSettingsSnapshot: () => settings,
      applyRemoteSettings,
      isActive: () => true,
      lastSyncedSettingsRef,
      setSyncedSettings,
      setSettingsSyncStatus,
      setError,
      hasInitializedSettingsRef,
    });
    expect(hasInitializedSettingsRef.current).toBe(true);
    expect(setSettingsSyncStatus).toHaveBeenCalledWith('syncing');
    expect(setSettingsSyncStatus).toHaveBeenCalledWith('synced');
    expect(typeof unsubscribeResult).toBe('function');
  });
});

describe('AuthProvider Local Auth', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });
  });

  test('initializes as signed_out if local profile fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const { result } = renderAuthHookWithStore(store);

    await waitForAuthEffects(0);

    expect(result.current.status).toBe('signed_out');
  });

  test('initializes as signed_in if local profile succeeds', async () => {
    const mockUser = {
      uid: 'local-user',
      email: 'local@example.com',
      settings: {
        darkMode: true,
        baseMapStyle: 'satellite',
        stateBorders: true,
        counties: true,
        ghostOutlooks: {},
        defaultForecasterName: 'Local Hero',
        forecastUiVariant: 'workspace_dock',
        monitorSettings: DEFAULT_MONITOR_SETTINGS,
      },
      betaAccess: true,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    const { result } = renderAuthHookWithStore(store);

    await waitForAuthEffects();

    expect(result.current.status).toBe('signed_in');
    expect(result.current.user?.uid).toBe('local-user');
  });

  test('signUpWithEmail calls /api/local/signup', async () => {
    const mockUser = { uid: 'user2', email: 'user2@example.com' };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser),
      });

    const { result } = renderAuthHookWithStore(store);

    await act(async () => {
      await result.current.signUpWithEmail('user2@example.com', 'password');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/local/signup',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user2@example.com', password: 'password' }),
      })
    );
    expect(result.current.status).toBe('signed_in');
  });

  test('signOutUser calls /api/local/signout', async () => {
    const mockUser = { uid: 'user1', email: 'user1@example.com' };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUser) })
      .mockResolvedValueOnce({ ok: true });

    const { result } = renderAuthHookWithStore(store);

    await waitForAuthEffects();

    expect(result.current.status).toBe('signed_in');

    await act(async () => {
      await result.current.signOutUser();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/local/signout',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.current.status).toBe('signed_out');
  });

  test('updateSyncedSettings calls /api/local/profile in local mode', async () => {
    const mockUser = { uid: 'user1', email: 'user1@example.com' };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockUser) })
      .mockResolvedValueOnce({ ok: true });

    const { result } = renderAuthHookWithStore(store);

    await waitForAuthEffects();

    await act(async () => {
      await result.current.updateSyncedSettings({ darkMode: false });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/local/profile',
      expect.objectContaining({ method: 'GET' })
    );
  });
});
