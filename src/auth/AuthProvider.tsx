import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAdditionalUserInfo,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { RootState } from '../store';
import { setDarkMode } from '../store/themeSlice';
import { applyOverlaySettings } from '../store/overlaysSlice';
import type { OverlaysState } from '../store/overlaysSlice';
import { applyMonitorSettings } from '../store/monitorSlice';
import { auth, db, googleAuthProvider, isHostedAuthEnabled, requireAuth, requireDb } from '../lib/firebase';
import { clearLocalTestAccount, createLocalTestUser, readLocalTestAccount } from '../lib/localTestAccount';
import { queueProductMetric } from '../utils/productMetrics';
import type { MonitorSettings } from '../monitor/types';
import { DEFAULT_MONITOR_SETTINGS, areMonitorSettingsEqual } from '../monitor/types';
import { normalizeMonitorSettings } from '../monitor/monitorSettingsNormalize';
import {
  DEFAULT_FORECAST_UI_VARIANT,
  normalizeForecastUiVariant,
  readStoredForecastUiVariant,
  type ForecastUiVariant,
  writeStoredForecastUiVariant,
} from '../utils/forecastUiVariant';

/**
 * Safely parse JSON from a Response. Returns parsed value or null on failure.
 */
export const safeParseJson = async <T = unknown>(resp: Response): Promise<T | null> => {
  try {
    const parsed = await resp.json();
    return parsed as T;
  } catch {
    return null;
  }
};

/** Coerce unknown value to a plain record for safe property access. */
export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** Attempt to extract minimal local user fields from an unknown response. */
export const extractLocalUserFromData = (data: unknown) => {
  const rec = asRecord(data);
  const uid = typeof rec.uid === 'string' ? rec.uid : 'local';
  const email = typeof rec.email === 'string' ? rec.email : '';
  const displayName = typeof rec.displayName === 'string' ? rec.displayName : '';
  return {
    uid,
    email,
    displayName,
    providerData: [],
  };
};

type AuthStatus = 'disabled' | 'loading' | 'signed_out' | 'signed_in' | 'error';
type SettingsSyncStatus = 'disabled' | 'idle' | 'syncing' | 'synced' | 'error';

interface UserSettingsDocument {
  darkMode: boolean;
  baseMapStyle: OverlaysState['baseMapStyle'];
  stateBorders: boolean;
  counties: boolean;
  ghostOutlooks: OverlaysState['ghostOutlooks'];
  defaultForecasterName: string;
  forecastUiVariant: ForecastUiVariant;
  monitorSettings: MonitorSettings;
}

interface UserProfileDocument {
  betaAccess?: boolean;
}

interface AuthContextValue {
  status: AuthStatus;
  settingsSyncStatus: SettingsSyncStatus;
  user: User | null;
  syncedSettings: UserSettingsDocument | null;
  error: string | null;
  hostedAuthEnabled: boolean;
  betaAccess: boolean;
  betaAccessLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
  updateSyncedSettings: (settings: Partial<UserSettingsDocument>) => Promise<void>;
  refreshBetaAccess: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const INITIAL_PROFILE_SYNC_STATUS: SettingsSyncStatus = isHostedAuthEnabled ? 'idle' : 'disabled';

/** Rejects hosted-auth actions when the current deployment intentionally runs in local-only mode. */
export const disabledAuthAction = (): Promise<void> => {
  throw new Error('Hosted accounts are not enabled for this deployment.');
};

/** Returns the settings-sync status that corresponds to the current deployment mode. */
export const getDisabledSettingsStatus = (): SettingsSyncStatus => (isHostedAuthEnabled ? 'idle' : 'disabled');

/** True when the hosted settings sync has everything it needs to run for the current user. */
export const canSyncHostedUserDocuments = (user: User | null): user is User =>
  Boolean(isHostedAuthEnabled && db && user);

/** Clears local Firebase state after the server has already completed deletion. */
export const clearDeletedAccountSession = async (
  signOutAction: () => Promise<void>,
  clearLocalState: () => void,
): Promise<void> => {
  // The server's 204 is authoritative. Clear React state first so the deleted
  // account view cannot remain mounted if Firebase's local sign-out rejects.
  clearLocalState();
  try {
    await signOutAction();
  } catch {
    // Server deletion is authoritative; local cleanup failure must not report
    // that the permanently completed deletion itself failed.
  }
};

/** Reauthenticates the current hosted user and requests the server-side deletion cascade. */
export const deleteHostedAccount = async (
  user: User,
  password?: string,
  clearLocalState: () => void = () => undefined,
): Promise<void> => {
  const hasGoogleProvider = user.providerData.some((provider) => provider.providerId === 'google.com');
  const hasPasswordProvider = user.providerData.some((provider) => provider.providerId === 'password');
  if (hasGoogleProvider) {
    await reauthenticateWithPopup(user, googleAuthProvider);
  } else if (hasPasswordProvider && user.email) {
    if (!password) throw new Error('Enter your current password to delete this account.');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } else {
    throw new Error('This sign-in method cannot be reauthenticated here. Contact support for account deletion.');
  }

  const token = await user.getIdToken(true);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch('/api/account/delete', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmation: 'DELETE' }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await safeParseJson<{ error?: string }>(response);
      throw new Error(body?.error || 'Unable to delete your account right now.');
    }
  } finally {
    clearTimeout(timeout);
  }

  await clearDeletedAccountSession(() => signOut(requireAuth()), clearLocalState);
};

/** Builds the normalized settings document shape from current local state. */
interface BuildSettingsArgs {
  darkMode: boolean;
  overlays: OverlaysState;
  defaultForecasterName: string;
  forecastUiVariant: ForecastUiVariant;
  monitorSettings?: MonitorSettings;
}
/** Builds the normalized settings document shape from current local state. */
export const createSettingsSnapshot = (args: BuildSettingsArgs): UserSettingsDocument => {
  const { darkMode, overlays, defaultForecasterName, forecastUiVariant, monitorSettings } = args;
  return {
    darkMode,
    baseMapStyle: overlays.baseMapStyle,
    stateBorders: overlays.stateBorders,
    counties: overlays.counties,
    ghostOutlooks: overlays.ghostOutlooks,
    defaultForecasterName,
    forecastUiVariant,
    monitorSettings: monitorSettings ?? DEFAULT_MONITOR_SETTINGS,
  };
};

/** Validates a Firestore settings payload before the app applies it locally. */
export const readRemoteSettings = (value: Partial<UserSettingsDocument> | undefined): UserSettingsDocument | null => {
  if (!value) {
    return null;
  }

  const {
    darkMode,
    baseMapStyle,
    stateBorders,
    counties,
    ghostOutlooks,
    defaultForecasterName,
    forecastUiVariant,
    monitorSettings,
  } = value;

  if (typeof darkMode !== 'boolean') {
    return null;
  }

  if (typeof stateBorders !== 'boolean' || typeof counties !== 'boolean') {
    return null;
  }

  if (typeof defaultForecasterName !== 'string') {
    return null;
  }

  if (!baseMapStyle || !ghostOutlooks) {
    return null;
  }

  return {
    darkMode,
    baseMapStyle,
    stateBorders,
    counties,
    ghostOutlooks,
    defaultForecasterName,
    forecastUiVariant: normalizeForecastUiVariant(forecastUiVariant) ?? DEFAULT_FORECAST_UI_VARIANT,
    monitorSettings: normalizeMonitorSettings(monitorSettings),
  };
};

/** Creates the user profile payload written to Firestore on hosted sign-in. */
export const createProfilePayload = (user: User) => ({
  email: user.email ?? '',
  displayName: user.displayName ?? '',
  photoURL: user.photoURL ?? '',
  providers: (user.providerData ?? []).map((provider) => provider.providerId),
  updatedAt: serverTimestamp(),
  createdAt: serverTimestamp(),
});

/** Reads the current beta-access flag from one hosted profile document snapshot. */
export const readProfileBetaAccess = (value: Partial<UserProfileDocument> | undefined): boolean =>
  Boolean(value?.betaAccess);

/** Normalizes update-write failures into a user-facing sync error message. */
export const getSettingsUpdateError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to update synced settings right now.';

/** Normalizes initial/settings hydration failures into a user-facing sync error message. */
export const getSettingsSyncError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to sync account settings right now.';

/** Builds the payload used when seeding or repairing a remote settings document. */
export const getRemoteSeedPayload = (settings: UserSettingsDocument, opts?: { includeCreatedAt?: boolean }) => ({
  ...settings,
  updatedAt: serverTimestamp(),
  ...(opts?.includeCreatedAt ? { createdAt: serverTimestamp() } : {}),
});

type LocalPostRequestOptions = {
  body?: unknown;
  failureMessage: string;
};

/** Posts JSON to a local auth endpoint and normalizes non-ok responses into errors. */
export const postLocalJson = async <TResponse = Record<string, unknown>>(
  path: string,
  { body, failureMessage }: LocalPostRequestOptions
): Promise<TResponse> => {
  const resp = await fetch(path, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
  });

  if (!resp.ok) {
    const errorBody = (await safeParseJson<{ message?: string }>(resp)) ?? {};
    throw new Error(errorBody.message ?? failureMessage);
  }

  return (await safeParseJson<TResponse>(resp)) ?? ({} as TResponse);
};

/** Compares hosted settings fields excluding updatedAt metadata. */
const compareUserSettingsFields = (
  left: UserSettingsDocument,
  right: UserSettingsDocument,
): boolean =>
  left.darkMode === right.darkMode &&
  left.baseMapStyle === right.baseMapStyle &&
  left.stateBorders === right.stateBorders &&
  left.counties === right.counties &&
  left.defaultForecasterName === right.defaultForecasterName &&
  left.forecastUiVariant === right.forecastUiVariant &&
  JSON.stringify(left.ghostOutlooks) === JSON.stringify(right.ghostOutlooks) &&
  areMonitorSettingsEqual(left.monitorSettings, right.monitorSettings);

/** True when two normalized settings payloads contain the same user-visible values. */
export const areUserSettingsEqual = (
  left: UserSettingsDocument | null,
  right: UserSettingsDocument | null
): boolean => {
  if (!left || !right) {
    return left === right;
  }

  return compareUserSettingsFields(left, right);
};

/** Applies a partial settings patch onto a normalized baseline document. */
export const mergeUserSettingsDocument = (
  base: UserSettingsDocument,
  patch: Partial<UserSettingsDocument>,
): UserSettingsDocument => ({
  ...base,
  ...patch,
});

/** Writes a merged settings document to Firestore with an updated server timestamp. */
const writeHostedSettingsDocument = async (
  settingsRef: ReturnType<typeof doc>,
  nextSettings: UserSettingsDocument,
): Promise<void> => {
  await setDoc(
    settingsRef,
    {
      ...nextSettings,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

/** Builds a full settings snapshot from local UI state when hosted sync has no baseline yet. */
const buildHostedAccountFallbackSettings = (
  darkMode: boolean,
  overlays: OverlaysState,
  displayName: string,
  forecastUiVariant: ForecastUiVariant,
  monitorSettings: MonitorSettings,
): UserSettingsDocument =>
  createSettingsSnapshot({
    darkMode,
    overlays,
    defaultForecasterName: displayName,
    forecastUiVariant,
    monitorSettings,
  });

interface PersistHostedSettingsContext {
  user: User;
  darkMode: boolean;
  overlays: OverlaysState;
  syncedSettings: UserSettingsDocument | null;
  monitorSettings: MonitorSettings;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

/** Merges a settings patch into the hosted document and updates local sync state. */
const persistHostedSettingsUpdate = async (
  context: PersistHostedSettingsContext,
  patch: Partial<UserSettingsDocument>,
): Promise<void> => {
  const {
    user,
    darkMode,
    overlays,
    syncedSettings,
    monitorSettings,
    lastSyncedSettingsRef,
    setSyncedSettings,
    setSettingsSyncStatus,
    setError,
  } = context;

  const forecastUiVariant =
    syncedSettings?.forecastUiVariant ?? readStoredForecastUiVariant() ?? DEFAULT_FORECAST_UI_VARIANT;
  const fallbackSettings = buildHostedAccountFallbackSettings(
    darkMode,
    overlays,
    user.displayName ?? '',
    forecastUiVariant,
    syncedSettings?.monitorSettings ?? monitorSettings,
  );
  const baselineSettings = lastSyncedSettingsRef.current ?? fallbackSettings;
  const nextSettings = mergeUserSettingsDocument(baselineSettings, patch);
  if (areUserSettingsEqual(baselineSettings, nextSettings)) {
    setSettingsSyncStatus('synced');
    return;
  }

  const previousSettings = lastSyncedSettingsRef.current;
  const previousSyncedSettings = syncedSettings;
  lastSyncedSettingsRef.current = nextSettings;
  setSyncedSettings(nextSettings);
  setSettingsSyncStatus('syncing');
  setError(null);

  try {
    await writeHostedSettingsDocument(doc(requireDb(), 'userSettings', user.uid), nextSettings);
    setSettingsSyncStatus('synced');
    writeStoredForecastUiVariant(nextSettings.forecastUiVariant);
  } catch (updateError) {
    lastSyncedSettingsRef.current = previousSettings;
    setSyncedSettings(previousSyncedSettings);
    setSettingsSyncStatus('error');
    setError(getSettingsUpdateError(updateError));
    throw updateError;
  }
};

/** True when the current overlay state already matches the incoming synced overlay values. */
export const areOverlaySettingsEqual = (
  current: OverlaysState,
  incoming: Pick<UserSettingsDocument, 'baseMapStyle' | 'stateBorders' | 'counties' | 'ghostOutlooks'>
): boolean =>
  current.baseMapStyle === incoming.baseMapStyle &&
  current.stateBorders === incoming.stateBorders &&
  current.counties === incoming.counties &&
  JSON.stringify(current.ghostOutlooks) === JSON.stringify(incoming.ghostOutlooks);

interface ApplySettingsContext {
  currentDarkModeRef: React.MutableRefObject<boolean>,
  currentOverlaysRef: React.MutableRefObject<OverlaysState>,
  dispatch: ReturnType<typeof useDispatch>,
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>,
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>
}

/** Applies a validated settings document into Redux plus local hosted-auth state. */
export const applySettingsToState = (
  settings: UserSettingsDocument,
  { currentDarkModeRef, currentOverlaysRef, dispatch, setSyncedSettings, lastSyncedSettingsRef }: ApplySettingsContext
) => {
  if (areUserSettingsEqual(lastSyncedSettingsRef.current, settings)) {
    return;
  }

  if (settings.darkMode !== currentDarkModeRef.current) {
    dispatch(setDarkMode(settings.darkMode));
  }

  if (
    !areOverlaySettingsEqual(currentOverlaysRef.current, {
      baseMapStyle: settings.baseMapStyle,
      stateBorders: settings.stateBorders,
      counties: settings.counties,
      ghostOutlooks: settings.ghostOutlooks,
    })
  ) {
    dispatch(
      applyOverlaySettings({
        baseMapStyle: settings.baseMapStyle,
        stateBorders: settings.stateBorders,
        counties: settings.counties,
        ghostOutlooks: settings.ghostOutlooks,
      })
    );
  }

  writeStoredForecastUiVariant(settings.forecastUiVariant);
  dispatch(applyMonitorSettings(settings.monitorSettings));
  lastSyncedSettingsRef.current = settings;
  setSyncedSettings(settings);
};

/** Creates or updates the hosted profile document while preserving the original creation timestamp. */
export const syncProfileDocument = async (
  profileRef: ReturnType<typeof doc>,
  user: User
): Promise<void> => {
  const profileSnapshot = await getDoc(profileRef);
  await setDoc(
    profileRef,
    {
      ...createProfilePayload(user),
      ...(profileSnapshot.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true }
  );
};

/** Reuses remote settings when available or seeds Firestore from the current local settings snapshot. */
export const seedOrApplySettings = async (opts: {
  settingsRef: ReturnType<typeof doc>;
  settingsSnapshot: Awaited<ReturnType<typeof getDoc>>;
  localSettings: UserSettingsDocument;
  applyRemoteSettings: (settings: UserSettingsDocument) => void;
  isActive: () => boolean;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
}): Promise<void> => {
  const {
    settingsRef,
    settingsSnapshot,
    localSettings,
    applyRemoteSettings,
    isActive,
    lastSyncedSettingsRef,
    setSyncedSettings,
  } = opts;
  const remoteSettings = readRemoteSettings(settingsSnapshot.data() as Partial<UserSettingsDocument> | undefined);

  if (!isActive()) {
    return;
  }

  if (remoteSettings) {
    applyRemoteSettings(remoteSettings);
    return;
  }

  await setDoc(
    settingsRef,
    getRemoteSeedPayload(localSettings, { includeCreatedAt: !settingsSnapshot.exists() }),
    { merge: true }
  );

  if (!isActive()) {
    return;
  }

  lastSyncedSettingsRef.current = localSettings;
  setSyncedSettings(localSettings);
};

/** Starts the live Firestore listener that keeps hosted settings mirrored into local app state. */
export const startSettingsSubscription = (opts: {
  settingsRef: ReturnType<typeof doc>;
  isActive: () => boolean;
  applyRemoteSettings: (settings: UserSettingsDocument) => void;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}): Unsubscribe =>
  onSnapshot(
    opts.settingsRef,
    (snapshot) => {
      const nextSettings = readRemoteSettings(snapshot.data() as Partial<UserSettingsDocument> | undefined);
      if (!opts.isActive() || !nextSettings) {
        return;
      }

      opts.applyRemoteSettings(nextSettings);
      opts.setSettingsSyncStatus('synced');
    },
    (snapshotError) => {
      if (opts.isActive()) {
        opts.setSettingsSyncStatus('error');
        opts.setError(snapshotError.message);
      }
    }
  );

/** Runs the initial hosted profile/settings sync before the live subscription takes over. */
export const runInitialHostedSync = async (opts: {
  profileRef: ReturnType<typeof doc>;
  settingsRef: ReturnType<typeof doc>;
  user: User;
  buildLocalSettingsSnapshot: () => UserSettingsDocument;
  applyRemoteSettings: (settings: UserSettingsDocument) => void;
  isActive: () => boolean;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  hasInitializedSettingsRef: React.MutableRefObject<boolean>;
}): Promise<Unsubscribe | undefined> => {
  opts.setSettingsSyncStatus('syncing');

  try {
    await syncProfileDocument(opts.profileRef, opts.user);

    const settingsSnapshot = await getDoc(opts.settingsRef);
    const localSettings = opts.buildLocalSettingsSnapshot();
    await seedOrApplySettings({
      settingsRef: opts.settingsRef,
      settingsSnapshot,
      localSettings,
      applyRemoteSettings: opts.applyRemoteSettings,
      isActive: opts.isActive,
      lastSyncedSettingsRef: opts.lastSyncedSettingsRef,
      setSyncedSettings: opts.setSyncedSettings,
    });

    if (!opts.isActive()) {
      return undefined;
    }

    opts.hasInitializedSettingsRef.current = true;
    opts.setSettingsSyncStatus('synced');

    return startSettingsSubscription({
      settingsRef: opts.settingsRef,
      isActive: opts.isActive,
      applyRemoteSettings: opts.applyRemoteSettings,
      setSettingsSyncStatus: opts.setSettingsSyncStatus,
      setError: opts.setError,
    });
  } catch (syncError) {
    if (opts.isActive()) {
      opts.setSettingsSyncStatus('error');
      opts.setError(getSettingsSyncError(syncError));
    }
    return undefined;
  }
};

/**
 * Initializes local-only auth state by probing the dev server's /api/local/profile endpoint.
 * Extracts a minimal user shape and applies any remote settings into local Redux state.
 * This is intentionally defined outside the hook to keep useLocalAuthState's cyclomatic
 * complexity lower for code health tools.
 */
export const initLocalAuthState = async (opts: {
  isActive: () => boolean;
  dispatch: ReturnType<typeof useDispatch>;
  currentDarkModeRef: React.MutableRefObject<boolean>;
  currentOverlaysRef: React.MutableRefObject<OverlaysState>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  setStatus: React.Dispatch<React.SetStateAction<AuthStatus>>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
  setBetaAccessLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
}) => {
  const {
    isActive,
    dispatch,
    currentDarkModeRef,
    currentOverlaysRef,
    setUser,
    setStatus,
    setSettingsSyncStatus,
    setSyncedSettings,
    setBetaAccess,
    setBetaAccessLoading,
    setError,
    lastSyncedSettingsRef,
  } = opts;

  try {
    const localTestAccount = readLocalTestAccount();
    if (localTestAccount) {
      applyLocalAuthData({
        ...createLocalTestUser(localTestAccount),
        betaAccess: true,
      }, {
        dispatch,
        currentDarkModeRef,
        currentOverlaysRef,
        setUser,
        setStatus,
        setSyncedSettings,
        setSettingsSyncStatus,
        lastSyncedSettingsRef,
        setBetaAccess,
        setBetaAccessLoading,
        setError,
      });
      return;
    }

    const resp = await fetch('/api/local/profile', { method: 'GET', credentials: 'include' });
    if (!isActive()) return;

    if (!resp.ok) {
      setStatus('signed_out');
      setSettingsSyncStatus('idle');
      setUser(null);
      setSyncedSettings(null);
      setBetaAccess(false);
      setBetaAccessLoading(false);
      setError(null);
      return;
    }

    const data = (await safeParseJson<Record<string, unknown>>(resp)) ?? {};

    // Reuse shared local-auth application logic to keep the hook body concise.
    applyLocalAuthData(data, {
      dispatch,
      currentDarkModeRef,
      currentOverlaysRef,
      setUser,
      setStatus,
      setSyncedSettings,
      setSettingsSyncStatus,
      lastSyncedSettingsRef,
      setBetaAccess,
      setBetaAccessLoading,
      setError,
    });
  } catch (err) {
    if (!isActive()) return;
    setStatus('error');
    setError(err instanceof Error ? err.message : 'Local auth initialization failed');
    setUser(null);
    setSyncedSettings(null);
    setBetaAccess(false);
    setBetaAccessLoading(false);
  }
};

/** Shared helper to apply a local auth response into application state. */
export function applyLocalAuthData(
  data: Record<string, unknown>,
  {
    dispatch,
    currentDarkModeRef,
    currentOverlaysRef,
    setUser,
    setStatus,
    setSyncedSettings,
    setSettingsSyncStatus,
    lastSyncedSettingsRef,
    setBetaAccess,
    setBetaAccessLoading,
    setError,
  }: {
    dispatch: ReturnType<typeof useDispatch>;
    currentDarkModeRef: React.MutableRefObject<boolean>;
    currentOverlaysRef: React.MutableRefObject<OverlaysState>;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    setStatus: React.Dispatch<React.SetStateAction<AuthStatus>>;
    setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
    setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
    lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
    setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
    setBetaAccessLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
  }
) {
  const localUser = extractLocalUserFromData(data) as unknown as User;

  setUser(localUser);
  setStatus('signed_in');

  const remoteSettings = readRemoteSettings(data.settings as Partial<UserSettingsDocument> | undefined);
  if (remoteSettings) {
    applySettingsToState(remoteSettings, {
      currentDarkModeRef,
      currentOverlaysRef,
      dispatch,
      setSyncedSettings,
      lastSyncedSettingsRef,
    });
    setSettingsSyncStatus('synced');
  } else {
    setSyncedSettings(null);
    setSettingsSyncStatus('idle');
  }

  setBetaAccess(Boolean(data.betaAccess));
  setBetaAccessLoading(false);
  setError(null);
}

/** Returns the no-config auth context used for intentionally local-only deployments. */
export const getDefaultContextValue = (): AuthContextValue => ({
  status: 'disabled',
  settingsSyncStatus: 'disabled',
  user: null,
  syncedSettings: null,
  error: null,
  hostedAuthEnabled: false,
  betaAccess: false,
  betaAccessLoading: false,
  signInWithGoogle: disabledAuthAction,
  signInWithEmail: disabledAuthAction,
  signUpWithEmail: disabledAuthAction,
  signOutUser: disabledAuthAction,
  deleteAccount: disabledAuthAction,
  updateSyncedSettings: disabledAuthAction,
  refreshBetaAccess: disabledAuthAction,
});

/** Owns the hosted-auth state machine, Firestore sync, and account actions used by the provider. */
/** Local-only auth action helpers (extracted to reduce hook complexity) */
/** Local-only sign in helper: posts to /api/local/signin and applies returned auth data to state. */
export const localSignInWithEmail = async (
  creds: { email: string; password: string },
  deps: {
    dispatch: ReturnType<typeof useDispatch>;
    currentDarkModeRef: React.MutableRefObject<boolean>;
    currentOverlaysRef: React.MutableRefObject<OverlaysState>;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    setStatus: React.Dispatch<React.SetStateAction<AuthStatus>>;
    setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
    setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
    lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
    setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
    setBetaAccessLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
  }
) => {
  const {
    dispatch,
    currentDarkModeRef,
    currentOverlaysRef,
    setUser,
    setStatus,
    setSyncedSettings,
    setSettingsSyncStatus,
    lastSyncedSettingsRef,
    setBetaAccess,
    setBetaAccessLoading,
    setError,
  } = deps;
  const { email, password } = creds;

  setError(null);

  const resp = await fetch('/api/local/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });

  if (!resp.ok) {
    const body = (await safeParseJson<{ message?: string }>(resp)) ?? { message: 'Sign in failed' };
    setError(body?.message ?? 'Sign in failed');
    throw new Error(body?.message ?? 'Sign in failed');
  }

  const data = (await safeParseJson<Record<string, unknown>>(resp)) ?? {};
  const localUser = extractLocalUserFromData(data) as unknown as User;

  applyLocalAuthData(data, {
    dispatch,
    currentDarkModeRef,
    currentOverlaysRef,
    setUser,
    setStatus,
    setSyncedSettings,
    setSettingsSyncStatus,
    lastSyncedSettingsRef,
    setBetaAccess,
    setBetaAccessLoading,
    setError,
  });

  queueProductMetric({ event: 'account_signin', user: localUser });
};

/** Local-only sign up helper: posts to /api/local/signup and applies returned auth data to state. */
export const localSignUpWithEmail = async (
  creds: { email: string; password: string },
  deps: {
    dispatch: ReturnType<typeof useDispatch>;
    currentDarkModeRef: React.MutableRefObject<boolean>;
    currentOverlaysRef: React.MutableRefObject<OverlaysState>;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    setStatus: React.Dispatch<React.SetStateAction<AuthStatus>>;
    setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
    setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
    lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
    setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
    setBetaAccessLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
  }
) => {
  const {
    dispatch,
    currentDarkModeRef,
    currentOverlaysRef,
    setUser,
    setStatus,
    setSyncedSettings,
    setSettingsSyncStatus,
    lastSyncedSettingsRef,
    setBetaAccess,
    setBetaAccessLoading,
    setError,
  } = deps;
  const { email, password } = creds;

  setError(null);

  const resp = await fetch('/api/local/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });

  if (!resp.ok) {
    const body = (await safeParseJson<{ message?: string }>(resp)) ?? { message: 'Sign up failed' };
    setError(body?.message ?? 'Sign up failed');
    throw new Error(body?.message ?? 'Sign up failed');
  }

  const data = (await safeParseJson<Record<string, unknown>>(resp)) ?? {};
  const localUser = extractLocalUserFromData(data) as unknown as User;

  applyLocalAuthData(data, {
    dispatch,
    currentDarkModeRef,
    currentOverlaysRef,
    setUser,
    setStatus,
    setSyncedSettings,
    setSettingsSyncStatus,
    lastSyncedSettingsRef,
    setBetaAccess,
    setBetaAccessLoading,
    setError,
  });

  queueProductMetric({ event: 'account_signup', user: localUser });
};

/** Local-only sign out helper: invalidates local session and clears local state. */
export const localSignOutUser = async (deps: {
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  setStatus: React.Dispatch<React.SetStateAction<AuthStatus>>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const { setUser, setStatus, setSyncedSettings, setSettingsSyncStatus, setBetaAccess } = deps;
  const fixtureActive = Boolean(readLocalTestAccount());
  if (fixtureActive && auth) {
    try {
      await signOut(auth);
    } catch {
      // Fixture sign-out must still clear the local session if hosted auth is unavailable.
    }
  }
  try {
    await postLocalJson('/api/local/signout', { failureMessage: 'Unable to sign out right now.' });
  } catch {
    // ignore local sign out errors
  }

  setUser(null);
  clearLocalTestAccount();
  setStatus('signed_out');
  setSyncedSettings(null);
  setSettingsSyncStatus('idle');
  setBetaAccess(false);
};

/** Refresh local-only beta access flag by querying /api/local/profile. */
export const localRefreshBetaAccess = async (deps: {
  setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
  setBetaAccessLoading: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const { setBetaAccess, setBetaAccessLoading } = deps;
  setBetaAccessLoading(true);

  try {
    const resp = await fetch('/api/local/profile', { method: 'GET', credentials: 'include' });
    if (!resp.ok) {
      setBetaAccess(false);
      setBetaAccessLoading(false);
      return;
    }

    const data = (await safeParseJson<Record<string, unknown>>(resp)) ?? {};
    setBetaAccess(Boolean(data.betaAccess));
  } catch {
    setBetaAccess(false);
  } finally {
    setBetaAccessLoading(false);
  }
};

/** Update remote synced settings for local-only auth. */
export const localUpdateSyncedSettings = async (
  settings: Partial<UserSettingsDocument>,
  deps: {
    setError: React.Dispatch<React.SetStateAction<string | null>>;
    currentDarkModeRef: React.MutableRefObject<boolean>;
    currentOverlaysRef: React.MutableRefObject<OverlaysState>;
    dispatch: ReturnType<typeof useDispatch>;
    setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
    lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
    setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  }
) => {
  const { setError, currentDarkModeRef, currentOverlaysRef, dispatch, setSyncedSettings, lastSyncedSettingsRef, setSettingsSyncStatus } = deps;
  setError(null);

  let data: Record<string, unknown>;
  try {
    data = await postLocalJson<Record<string, unknown>>('/api/local/profile', {
      body: { settings },
      failureMessage: 'Unable to update synced settings right now.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update synced settings right now.';
    setError(message);
    throw error instanceof Error ? error : new Error(message);
  }

  const remoteSettings = readRemoteSettings(data.settings as Partial<UserSettingsDocument> | undefined);
  if (remoteSettings) {
    applySettingsToState(remoteSettings, {
      currentDarkModeRef,
      currentOverlaysRef,
      dispatch,
      setSyncedSettings,
      lastSyncedSettingsRef,
    });
    setSettingsSyncStatus('synced');
  }
};

/** Provides local-only auth state and actions for dev servers. */
interface LocalAuthDeps {
  dispatch: ReturnType<typeof useDispatch>;
  currentDarkModeRef: React.MutableRefObject<boolean>;
  currentOverlaysRef: React.MutableRefObject<OverlaysState>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  setStatus: React.Dispatch<React.SetStateAction<AuthStatus>>;
  setSyncedSettings: React.Dispatch<React.SetStateAction<UserSettingsDocument | null>>;
  setSettingsSyncStatus: React.Dispatch<React.SetStateAction<SettingsSyncStatus>>;
  lastSyncedSettingsRef: React.MutableRefObject<UserSettingsDocument | null>;
  setBetaAccess: React.Dispatch<React.SetStateAction<boolean>>;
  setBetaAccessLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

/** BuildLocalActions: creates wrapper action functions for local dev auth flows.
 *
 * These wrappers adapt the local helper functions (localSignInWithEmail, localSignUpWithEmail, etc.)
 * to the shape expected by components and keep wiring centralized behind a typed LocalAuthDeps object.
 */
function buildLocalActions(deps: LocalAuthDeps) {
  return {
    signInWithEmail: (email: string, password: string) =>
      localSignInWithEmail({ email, password }, deps),
    signUpWithEmail: (email: string, password: string) =>
      localSignUpWithEmail({ email, password }, deps),
    signOutUser: () =>
      localSignOutUser({
        setUser: deps.setUser,
        setStatus: deps.setStatus,
        setSyncedSettings: deps.setSyncedSettings,
        setSettingsSyncStatus: deps.setSettingsSyncStatus,
        setBetaAccess: deps.setBetaAccess,
      }),
    refreshBetaAccess: (): Promise<void> =>
      localRefreshBetaAccess({ setBetaAccess: deps.setBetaAccess, setBetaAccessLoading: deps.setBetaAccessLoading }),
    updateSyncedSettings: (settings: Partial<UserSettingsDocument>): Promise<void> =>
      localUpdateSyncedSettings(settings, {
        setError: deps.setError,
        currentDarkModeRef: deps.currentDarkModeRef,
        currentOverlaysRef: deps.currentOverlaysRef,
        dispatch: deps.dispatch,
        setSyncedSettings: deps.setSyncedSettings,
        lastSyncedSettingsRef: deps.lastSyncedSettingsRef,
        setSettingsSyncStatus: deps.setSettingsSyncStatus,
      }),
  };
}

/** useLocalAuthState: Hook that provides local-only auth state and actions (dev-only).
 *
 * Exposes the same AuthContextValue shape as the hosted implementation but operates
 * against the local /api/local/* endpoints. Intended to be used by development servers
 * to enable beta/local-only flows without requiring hosted auth.
 */
const useLocalAuthState = (): AuthContextValue => {
  const dispatch = useDispatch();
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const overlays = useSelector((state: RootState) => state.overlays);
  const currentDarkModeRef = useRef(darkMode);
  const currentOverlaysRef = useRef(overlays);
  const lastSyncedSettingsRef = useRef<UserSettingsDocument | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [settingsSyncStatus, setSettingsSyncStatus] = useState<SettingsSyncStatus>('idle');
  const [user, setUser] = useState<User | null>(null);
  const [syncedSettings, setSyncedSettings] = useState<UserSettingsDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [betaAccess, setBetaAccess] = useState(false);
  const [betaAccessLoading, setBetaAccessLoading] = useState(false);

  useEffect(() => {
    currentDarkModeRef.current = darkMode;
  }, [darkMode]);

  useEffect(() => {
    currentOverlaysRef.current = overlays;
  }, [overlays]);

  useEffect(() => {
    let isActive = true;

    // Delegate complex initialization to a helper to keep hook complexity low.
    initLocalAuthState({
      isActive: () => isActive,
      dispatch,
      currentDarkModeRef,
      currentOverlaysRef,
      setUser,
      setStatus,
      setSettingsSyncStatus,
      setSyncedSettings,
      setBetaAccess,
      setBetaAccessLoading,
      setError,
      lastSyncedSettingsRef,
    });

    return () => {
      isActive = false;
    };
  }, [dispatch]);

  const deps: LocalAuthDeps = {
    dispatch,
    currentDarkModeRef,
    currentOverlaysRef,
    setUser,
    setStatus,
    setSyncedSettings,
    setSettingsSyncStatus,
    lastSyncedSettingsRef,
    setBetaAccess,
    setBetaAccessLoading,
    setError,
  };

  const localActions = useMemo(() => buildLocalActions(deps), [
    dispatch,
    currentDarkModeRef,
    currentOverlaysRef,
    setUser,
    setStatus,
    setSyncedSettings,
    setSettingsSyncStatus,
    lastSyncedSettingsRef,
    setBetaAccess,
    setBetaAccessLoading,
    setError,
  ]);

  const { signInWithEmail, signUpWithEmail, signOutUser, refreshBetaAccess, updateSyncedSettings } = localActions;

  const value = useMemo<AuthContextValue>(() => ({
    status,
    settingsSyncStatus,
    user,
    syncedSettings,
    error,
    hostedAuthEnabled: true,
    betaAccess,
    betaAccessLoading,
    signInWithGoogle: disabledAuthAction,
    signInWithEmail,
    signUpWithEmail,
    signOutUser,
    deleteAccount: disabledAuthAction,
    updateSyncedSettings,
    refreshBetaAccess,
  }), [
    status,
    settingsSyncStatus,
    user,
    syncedSettings,
    error,
    betaAccess,
    betaAccessLoading,
    signInWithEmail,
    signUpWithEmail,
    signOutUser,
    updateSyncedSettings,
    refreshBetaAccess,
  ]);

  return value;
};

/**
 * Provides hosted-auth state and actions while syncing user documents with Firestore.
 * Handles auth state changes, settings synchronization, and beta access refresh.
 */
const useHostedAuthState = (): AuthContextValue => {
  const dispatch = useDispatch();
  const darkMode = useSelector((state: RootState) => state.theme.darkMode);
  const overlays = useSelector((state: RootState) => state.overlays);
  const monitorSettings = useSelector((state: RootState) => state.monitor);
  const currentDarkModeRef = useRef(darkMode);
  const currentOverlaysRef = useRef(overlays);
  const currentMonitorSettingsRef = useRef(monitorSettings);
  const hasInitializedSettingsRef = useRef(false);
  const lastSyncedSettingsRef = useRef<UserSettingsDocument | null>(null);
  const pendingSettingsWriteRef = useRef<number | null>(null);
  const betaAccessRequestIdRef = useRef(0);
  const [status, setStatus] = useState<AuthStatus>(isHostedAuthEnabled ? 'loading' : 'disabled');
  const [settingsSyncStatus, setSettingsSyncStatus] = useState<SettingsSyncStatus>(INITIAL_PROFILE_SYNC_STATUS);
  const [user, setUser] = useState<User | null>(null);
  const [syncedSettings, setSyncedSettings] = useState<UserSettingsDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [betaAccess, setBetaAccess] = useState(false);
  const [betaAccessLoading, setBetaAccessLoading] = useState(Boolean(isHostedAuthEnabled));

  useEffect(() => {
    currentDarkModeRef.current = darkMode;
  }, [darkMode]);

  useEffect(() => {
    currentOverlaysRef.current = overlays;
  }, [overlays]);

  useEffect(() => {
    currentMonitorSettingsRef.current = monitorSettings;
  }, [monitorSettings]);

  useEffect(function subscribeToHostedAuthState() {
    if (!isHostedAuthEnabled || !auth) {
      setStatus('disabled');
      setSettingsSyncStatus('disabled');
      setUser(null);
      setSyncedSettings(null);
      setBetaAccess(false);
      setBetaAccessLoading(false);
      hasInitializedSettingsRef.current = false;
      lastSyncedSettingsRef.current = null;
      setError(null);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setStatus(nextUser ? 'signed_in' : 'signed_out');
        setSettingsSyncStatus('idle');
        if (!nextUser) {
          setSyncedSettings(null);
          setBetaAccess(false);
          setBetaAccessLoading(false);
        }
        setError(null);
      },
      (nextError) => {
        setUser(null);
        setStatus('error');
        setSettingsSyncStatus('error');
        setSyncedSettings(null);
        setBetaAccess(false);
        setBetaAccessLoading(false);
        setError(nextError.message);
      }
    );

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupHostedAuthSubscription() {
      unsubscribe();
    };
  }, []);

  useEffect(function syncHostedUserDocuments() {
    if (!canSyncHostedUserDocuments(user)) {
      hasInitializedSettingsRef.current = false;
      lastSyncedSettingsRef.current = null;
      if (pendingSettingsWriteRef.current) {
        window.clearTimeout(pendingSettingsWriteRef.current);
        pendingSettingsWriteRef.current = null;
      }
      setSyncedSettings(null);
      setBetaAccess(false);
      setBetaAccessLoading(false);
      if (status !== 'loading') {
        setSettingsSyncStatus(getDisabledSettingsStatus());
      }
      return;
    }

    let isActive = true;
    const settingsRef = doc(requireDb(), 'userSettings', user.uid);
    const profileRef = doc(requireDb(), 'userProfiles', user.uid);
    let unsubscribeSettings: Unsubscribe | undefined;
    const settingsApplyContext: ApplySettingsContext = {
      currentDarkModeRef,
      currentOverlaysRef,
      dispatch,
      setSyncedSettings,
      lastSyncedSettingsRef,
    };

    /** Captures the current local settings so they can seed a missing cloud document. */
    const buildLocalSettingsSnapshot = (): UserSettingsDocument =>
      createSettingsSnapshot({
        darkMode: currentDarkModeRef.current,
        overlays: currentOverlaysRef.current,
        defaultForecasterName: user.displayName ?? '',
        forecastUiVariant: readStoredForecastUiVariant() ?? DEFAULT_FORECAST_UI_VARIANT,
        monitorSettings: currentMonitorSettingsRef.current,
      });

    /** Applies validated remote settings into Redux and local auth state. */
    const applyRemoteSettings = (settings: UserSettingsDocument) =>
      applySettingsToState(settings, settingsApplyContext);
    runInitialHostedSync({
      profileRef,
      settingsRef,
      user,
      buildLocalSettingsSnapshot,
      applyRemoteSettings,
      isActive: () => isActive,
      lastSyncedSettingsRef,
      setSyncedSettings,
      setSettingsSyncStatus,
      setError,
      hasInitializedSettingsRef,
    }).then((nextUnsubscribe) => {
      if (nextUnsubscribe) {
        unsubscribeSettings = nextUnsubscribe;
      }
    });

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupHostedUserSync() {
      isActive = false;
      hasInitializedSettingsRef.current = false;
      if (pendingSettingsWriteRef.current) {
        window.clearTimeout(pendingSettingsWriteRef.current);
        pendingSettingsWriteRef.current = null;
      }
      unsubscribeSettings?.();
    };
  }, [dispatch, status, user]);

  /** Refreshes the signed-in user's beta-access flag from the hosted profile document. */
  const refreshBetaAccess = useCallback(async (): Promise<void> => {
    const hostedProfileUnavailable = !isHostedAuthEnabled || !db || !user;
    if (hostedProfileUnavailable) {
      setBetaAccess(false);
      setBetaAccessLoading(false);
      return;
    }

    betaAccessRequestIdRef.current += 1;
    const requestId = betaAccessRequestIdRef.current;
    setBetaAccessLoading(true);

    try {
      const profileSnapshot = await getDoc(doc(requireDb(), 'userProfiles', user.uid));
      if (requestId !== betaAccessRequestIdRef.current) {
        return;
      }

      setBetaAccess(
        readProfileBetaAccess(profileSnapshot.data() as Partial<UserProfileDocument> | undefined)
      );
    } catch {
      if (requestId !== betaAccessRequestIdRef.current) {
        return;
      }

      setBetaAccess(false);
    } finally {
      if (requestId === betaAccessRequestIdRef.current) {
        setBetaAccessLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    if (!isHostedAuthEnabled || !db) {
      setBetaAccess(false);
      setBetaAccessLoading(false);
      return;
    }

    if (status === 'loading') {
      setBetaAccessLoading(true);
      return;
    }

    if (!user) {
      setBetaAccess(false);
      setBetaAccessLoading(false);
      return;
    }

    refreshBetaAccess().catch(() => {
      // Beta-access failures fall back to the locked beta gate.
    });
  }, [refreshBetaAccess, status, user]);

  useEffect(() => {
    const isSyncUnavailable =
      !isHostedAuthEnabled || !db || !user || settingsSyncStatus === 'disabled' || settingsSyncStatus === 'idle';
    if (isSyncUnavailable) {
      return;
    }

    const isSyncBlocked = settingsSyncStatus === 'syncing' || status !== 'signed_in' || !hasInitializedSettingsRef.current;
    if (isSyncBlocked) {
      return;
    }

    const nextSettings = createSettingsSnapshot({
      darkMode,
      overlays,
      defaultForecasterName: syncedSettings?.defaultForecasterName ?? user.displayName ?? '',
      forecastUiVariant: syncedSettings?.forecastUiVariant ?? DEFAULT_FORECAST_UI_VARIANT,
      monitorSettings: syncedSettings?.monitorSettings ?? monitorSettings,
    });

    if (areUserSettingsEqual(lastSyncedSettingsRef.current, nextSettings)) {
      return;
    }

    const settingsRef = doc(requireDb(), 'userSettings', user.uid);
    if (pendingSettingsWriteRef.current) {
      window.clearTimeout(pendingSettingsWriteRef.current);
    }

    pendingSettingsWriteRef.current = window.setTimeout(() => {
      lastSyncedSettingsRef.current = nextSettings;

      setDoc(
        settingsRef,
        {
          ...nextSettings,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch((syncError) => {
        lastSyncedSettingsRef.current = null;
        setSettingsSyncStatus('error');
        setError(getSettingsUpdateError(syncError));
      }).finally(() => {
        pendingSettingsWriteRef.current = null;
      });
    }, 750);

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupPendingSettingsWrite() {
      if (pendingSettingsWriteRef.current) {
        window.clearTimeout(pendingSettingsWriteRef.current);
        pendingSettingsWriteRef.current = null;
      }
    };
  }, [darkMode, overlays, settingsSyncStatus, status, syncedSettings?.defaultForecasterName, user]);

  /** Persists explicit account settings changes made from the account page. */
  const updateSyncedSettings = (settings: Partial<UserSettingsDocument>): Promise<void> =>
    persistHostedSettingsUpdate(
      {
        user: user as User,
        darkMode,
        overlays,
        syncedSettings,
        monitorSettings,
        lastSyncedSettingsRef,
        setSyncedSettings,
        setSettingsSyncStatus,
        setError,
      },
      settings,
    );

  const value = useMemo<AuthContextValue>(() => {
    if (!isHostedAuthEnabled || !auth) {
      return getDefaultContextValue();
    }

    return {
      status,
      settingsSyncStatus,
      user,
      syncedSettings,
      error,
      hostedAuthEnabled: true,
      betaAccess,
      betaAccessLoading,
      signInWithGoogle: async () => {
        setError(null);
        const credential = await signInWithPopup(requireAuth(), googleAuthProvider);
        queueProductMetric({
          event: getAdditionalUserInfo(credential)?.isNewUser ? 'account_signup' : 'account_signin',
          user: credential.user,
        });
      },
      signInWithEmail: async (email: string, password: string) => {
        setError(null);
        const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
        queueProductMetric({ event: 'account_signin', user: credential.user });
      },
      signUpWithEmail: async (email: string, password: string) => {
        setError(null);
        const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);
        queueProductMetric({ event: 'account_signup', user: credential.user });
      },
      signOutUser: async () => {
        setError(null);
        await signOut(requireAuth());
      },
      deleteAccount: async (password?: string) => {
        setError(null);
        if (!user) throw new Error('Sign in before deleting your account.');
        await deleteHostedAccount(user, password, () => {
          setUser(null);
          setStatus('signed_out');
          setSyncedSettings(null);
          setSettingsSyncStatus('idle');
          setBetaAccess(false);
          setBetaAccessLoading(false);
          hasInitializedSettingsRef.current = false;
          lastSyncedSettingsRef.current = null;
        });
      },
      updateSyncedSettings,
      refreshBetaAccess,
    };
  }, [betaAccess, betaAccessLoading, error, refreshBetaAccess, settingsSyncStatus, status, syncedSettings, user]);

  return value;
};

/** Provides hosted-auth state and actions while gracefully falling back to local-only mode. */
const LocalAuthContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useLocalAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** Provides hosted auth state and listeners when no local fixture is active. */
const HostedAuthContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hostedValue = useHostedAuthState();
  const localValue = useLocalAuthState();
  const value = isHostedAuthEnabled ? hostedValue : localValue;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** Exposes exactly one auth implementation so fixture sessions never run hosted listeners. */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  readLocalTestAccount()
    ? <LocalAuthContextProvider>{children}</LocalAuthContextProvider>
    : <HostedAuthContextProvider>{children}</HostedAuthContextProvider>
);

/** Reads the current hosted-auth state and actions for the app. */
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
