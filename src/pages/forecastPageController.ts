import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, UnknownAction } from 'redux';
import type { ForecastMapHandle } from '../components/Map/ForecastMap';
import type { AddToastFn } from '../components/Layout';
import { useAuth } from '../auth/AuthProvider';
import {
  clearWorkflowMetadata,
  importForecastCycle,
  markAsSaved,
  resetForecasts,
  restoreForecastCycle,
  saveCurrentCycle,
  setMapView,
  setWorkflowMetadata,
  selectForecastCycle,
} from '../store/forecastSlice';
import type { RootState } from '../store';
import type { GFCForecastSaveData } from '../types/outlooks';
import { deserializeForecast, exportForecastToJson, MAX_IMPORT_BYTES, serializeForecast, validateForecastData, validateForecastDataReason } from '../utils/fileUtils';
import { getAutoSaveStorageKey, migrateLegacyAutoSave, selectPreferredAutoSaveValue } from '../hooks/useAutoSave';
import {
  DAY_ROLLOVER_CHECK_INTERVAL_MS,
  DAY_ROLLOVER_LAST_ACTIVE_KEY,
  DAY_ROLLOVER_PROMPTED_KEY,
  type DayRolloverPromptState,
  clearStoredRolloverPrompt,
  getRolloverStorageKey,
  readStoredDayValue,
  readStoredRolloverPrompt,
  writeStoredDayValue,
  writeStoredRolloverPrompt,
} from '../utils/dayRolloverStorage';
import { getStorageScope, getScopedStorageKey } from '../utils/storageScope';
import { countForecastMetrics } from '../utils/forecastMetrics';
import { getLocalCalendarDate } from '../utils/localDate';
import { queueProductMetric } from '../utils/productMetrics';
import type { UseCloudCyclesResult } from '../hooks/useCloudCycles';

export type ShortcutDispatch = Dispatch<UnknownAction>;

interface LoadedForecastPayload {
  rawData: {
    mapView?: { center: [number, number]; zoom: number };
    cycleMetadata?: import('../types/workflow').CycleMetadata;
  };
  deserializedCycle: ReturnType<typeof deserializeForecast>;
}

interface StoredCloudMeta {
  id?: string;
  label?: string;
}

const CLOUD_CYCLE_PAYLOAD_KEY = 'cloudCyclePayload';
const CLOUD_CYCLE_META_KEY = 'cloudCycleMeta';

/** Reads the current map view through the adapter, with the application default as a safe fallback. */
export const buildMapView = (ref: React.RefObject<ForecastMapHandle | null>) => {
  const adapter = ref.current;
  return adapter?.getView() ?? {
    center: [39.8283, -98.5795] as [number, number],
    zoom: 4,
  };
};

/** Reads and validates one forecast JSON file. */
export const parseLoadedForecast = async (
  file: File,
  addToast: AddToastFn,
): Promise<LoadedForecastPayload | null> => {
  if (file.size > MAX_IMPORT_BYTES) {
    addToast(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB); the maximum supported size is ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`, 'error');
    return null;
  }

  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    addToast('File is not valid JSON.', 'error');
    return null;
  }

  const validationError = validateForecastDataReason(data);
  if (validationError) {
    addToast(validationError, 'error');
    return null;
  }

  return {
    rawData: data as LoadedForecastPayload['rawData'],
    deserializedCycle: deserializeForecast(data),
  };
};

/** Returns true when one serialized forecast day contains drawable outlook features. */
export const dayHasAnyFeatures = (dayData: unknown): boolean => {
  if (!dayData || typeof dayData !== 'object') return false;
  return Object.values(dayData as Record<string, { size?: number } | undefined>)
    .some((outlookMap) => (outlookMap?.size ?? 0) > 0);
};

const applyLoadedForecast = (
  payload: LoadedForecastPayload,
  dispatch: ShortcutDispatch,
  mapRef: React.RefObject<ForecastMapHandle | null>,
) => {
  dispatch(importForecastCycle(payload.deserializedCycle));
  if (payload.rawData.cycleMetadata) dispatch(setWorkflowMetadata(payload.rawData.cycleMetadata));
  else if (payload.rawData.cycleMetadata === null) dispatch(clearWorkflowMetadata());

  if (payload.rawData.mapView) {
    dispatch(setMapView(payload.rawData.mapView));
    return;
  }

  const map = mapRef.current?.getMap();
  const currentDayData = payload.deserializedCycle.days[payload.deserializedCycle.currentDay]?.data;
  if (map && dayHasAnyFeatures(currentDayData)) {
    dispatch(setMapView({ center: [39.8283, -98.5795], zoom: 4 }));
  }
};

const useForecastSaveAction = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  mapRef: React.RefObject<ForecastMapHandle | null>,
  user: ReturnType<typeof useAuth>['user'],
  workflowMetadata?: import('../types/workflow').CycleMetadata,
) => useCallback(() => {
  try {
    exportForecastToJson(forecastCycle, buildMapView(mapRef), workflowMetadata);
    dispatch(markAsSaved());
    queueProductMetric({ event: 'cycle_saved', user });
    addToast('Forecast exported to JSON!', 'success');
  } catch {
    addToast('Error exporting forecast.', 'error');
  }
}, [addToast, dispatch, forecastCycle, mapRef, user, workflowMetadata]);

const useForecastLoadAction = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  mapRef: React.RefObject<ForecastMapHandle | null>,
) => useCallback(async (file: File) => {
  try {
    const payload = await parseLoadedForecast(file, addToast);
    if (!payload) return;
    applyLoadedForecast(payload, dispatch, mapRef);
    addToast('Forecast loaded successfully!', 'success');
  } catch {
    addToast('Error reading file.', 'error');
  }
}, [addToast, dispatch, mapRef]);

/** Composes the save and load actions owned by the forecast session controller. */
export const useForecastFileActions = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  mapRef: React.RefObject<ForecastMapHandle | null>,
  user: ReturnType<typeof useAuth>['user'],
  workflowMetadata?: import('../types/workflow').CycleMetadata,
) => ({
  handleSave: useForecastSaveAction(dispatch, addToast, forecastCycle, mapRef, user, workflowMetadata),
  handleLoad: useForecastLoadAction(dispatch, addToast, mapRef),
});

/** Returns true when a cycle has at least one forecast day or discussion. */
export const hasRolloverForecastData = (forecastCycle: ReturnType<typeof selectForecastCycle>): boolean =>
  countForecastMetrics(forecastCycle).forecastDays > 0;

export const cycleHasDiscussionContent = (forecastCycle: ReturnType<typeof selectForecastCycle>): boolean =>
  Object.values(forecastCycle.days).some((dayData) => Boolean(dayData?.discussion));

export const hasUnpublishedDiscussionDrafts = (
  discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope'],
): boolean => Object.keys(discussionDraftsByScope).length > 0;

export const hasUnsavedRolloverCandidateSession = (
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  isSaved: boolean,
): boolean => !isSaved && (hasRolloverForecastData(forecastCycle) || cycleHasDiscussionContent(forecastCycle));

export const buildRolloverSaveLabel = (cycleDate: string): string => {
  const parsedDate = new Date(`${cycleDate}T00:00:00`);
  const labelDate = Number.isNaN(parsedDate.getTime())
    ? cycleDate
    : parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Rollover save • ${labelDate}`;
};

export const formatRolloverDayLabel = (value: string): string => {
  const parsedDate = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsedDate.getTime())
    ? value
    : parsedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
};

export const parseStoredForecastPayload = (storedValue: string | null): GFCForecastSaveData | null => {
  if (!storedValue) return null;
  try {
    const parsed = JSON.parse(storedValue) as unknown;
    return validateForecastData(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const parseStoredCloudMeta = (storedValue: string | null): StoredCloudMeta | null => {
  if (!storedValue) return null;
  try {
    return JSON.parse(storedValue) as StoredCloudMeta;
  } catch {
    return null;
  }
};

export const clearStoredCloudSession = (userId?: string | null) => {
  sessionStorage.removeItem(getScopedStorageKey(CLOUD_CYCLE_PAYLOAD_KEY, getStorageScope(userId)));
  sessionStorage.removeItem(getScopedStorageKey(CLOUD_CYCLE_META_KEY, getStorageScope(userId)));
  if (!userId) {
    sessionStorage.removeItem(CLOUD_CYCLE_PAYLOAD_KEY);
    sessionStorage.removeItem(CLOUD_CYCLE_META_KEY);
  }
};

export const hasRestorableCloudSelection = (
  cloudMeta: StoredCloudMeta | null,
): cloudMeta is Required<Pick<StoredCloudMeta, 'id' | 'label'>> => Boolean(cloudMeta?.id && cloudMeta.label);

const restoreStoredForecastPayload = (
  data: GFCForecastSaveData,
  dispatch: ShortcutDispatch,
  preserveDiscussionDrafts = false,
) => {
  const deserializedCycle = deserializeForecast(data);
  dispatch(preserveDiscussionDrafts ? restoreForecastCycle(deserializedCycle, true) : importForecastCycle(deserializedCycle));
  if (data.cycleMetadata) dispatch(setWorkflowMetadata(data.cycleMetadata));
  else if (data.cycleMetadata === null) dispatch(clearWorkflowMetadata());
  const rawData = data as LoadedForecastPayload['rawData'];
  if (rawData.mapView) dispatch(setMapView(rawData.mapView));
};

const restoreCloudSession = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void,
  userId?: string | null,
): boolean => {
  const payloadKey = getScopedStorageKey(CLOUD_CYCLE_PAYLOAD_KEY, getStorageScope(userId));
  const payload = parseStoredForecastPayload(sessionStorage.getItem(payloadKey) ?? (!userId ? sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY) : null));
  if (!payload) return false;

  const metaKey = getScopedStorageKey(CLOUD_CYCLE_META_KEY, getStorageScope(userId));
  const cloudMeta = parseStoredCloudMeta(sessionStorage.getItem(metaKey) ?? (!userId ? sessionStorage.getItem(CLOUD_CYCLE_META_KEY) : null));
  restoreStoredForecastPayload(payload, dispatch);
  if (onCloudCycleLoaded && hasRestorableCloudSelection(cloudMeta)) onCloudCycleLoaded({ id: cloudMeta.id, label: cloudMeta.label });
  clearStoredCloudSession(userId);
  addToast('Cloud forecast loaded successfully.', 'success');
  return true;
};

const shouldSkipLocalRestore = (
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope'],
) => hasRolloverForecastData(forecastCycle) || cycleHasDiscussionContent(forecastCycle) || hasUnpublishedDiscussionDrafts(discussionDraftsByScope);

const copyLegacyAutoSaveToScopedStorage = (scopedKey: string, legacyValue: string | null): void => {
  if (legacyValue === null) return;
  localStorage.setItem(scopedKey, legacyValue);
  localStorage.removeItem('forecastData');
};

const restoreLocalSession = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  currentSession: { forecastCycle: ReturnType<typeof selectForecastCycle>; discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope'] },
  userId?: string | null,
): boolean => {
  if (shouldSkipLocalRestore(currentSession.forecastCycle, currentSession.discussionDraftsByScope)) return false;
  const scopedKey = getAutoSaveStorageKey(userId);
  const scopedValue = localStorage.getItem(scopedKey);
  const legacyValue = userId ? localStorage.getItem('forecastData') : null;
  const storedValue = userId ? selectPreferredAutoSaveValue(scopedValue, legacyValue) : scopedValue;
  const data = parseStoredForecastPayload(storedValue);
  if (!data) return false;
  if (userId && legacyValue !== null && storedValue === legacyValue) copyLegacyAutoSaveToScopedStorage(scopedKey, legacyValue);
  restoreStoredForecastPayload(data, dispatch, true);
  addToast('Session restored from auto-save.', 'success');
  return true;
};

const restoreAvailableSession = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  currentSession: { forecastCycle: ReturnType<typeof selectForecastCycle>; discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope']; onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void },
  userId?: string | null,
) => restoreCloudSession(dispatch, addToast, currentSession.onCloudCycleLoaded, userId)
  || restoreLocalSession(dispatch, addToast, currentSession, userId);

export const buildRestoreKey = (userId?: string | null): string => userId || 'anonymous';

/** Restores the pending cloud or local session once per signed-in storage scope. */
export const useSessionRestore = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  currentSession: {
    forecastCycle: ReturnType<typeof selectForecastCycle>;
    discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope'];
    currentMapView: RootState['forecast']['currentMapView'];
    workflowMetadata: RootState['forecast']['workflowMetadata'];
    onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void;
  },
  userId?: string | null,
) => {
  const onCloudCycleLoadedRef = useRef(currentSession.onCloudCycleLoaded);
  const forecastCycleRef = useRef(currentSession.forecastCycle);
  const initialDraftsRef = useRef(currentSession.discussionDraftsByScope);
  const currentMapViewRef = useRef(currentSession.currentMapView);
  const workflowMetadataRef = useRef(currentSession.workflowMetadata);
  const previousUserIdRef = useRef(userId);
  const appliedRestoreKeyRef = useRef<string | null>(null);
  const [restoreComplete, setRestoreComplete] = useState(false);
  const [restoredSession, setRestoredSession] = useState(false);
  const [restoreAttempted, setRestoreAttempted] = useState(false);

  useEffect(() => {
    onCloudCycleLoadedRef.current = currentSession.onCloudCycleLoaded;
    forecastCycleRef.current = currentSession.forecastCycle;
    currentMapViewRef.current = currentSession.currentMapView;
    workflowMetadataRef.current = currentSession.workflowMetadata;
  }, [currentSession.currentMapView, currentSession.forecastCycle, currentSession.onCloudCycleLoaded, currentSession.workflowMetadata]);

  useEffect(() => {
    try {
      const liveSession = previousUserIdRef.current == null && userId
        ? serializeForecast(forecastCycleRef.current, currentMapViewRef.current, workflowMetadataRef.current)
        : undefined;
      migrateLegacyAutoSave(userId, liveSession);
      previousUserIdRef.current = userId;
      const restoreKey = buildRestoreKey(userId);
      if (appliedRestoreKeyRef.current === restoreKey) {
        setRestoreAttempted(true);
        return;
      }
      appliedRestoreKeyRef.current = restoreKey;
      setRestoredSession(restoreAvailableSession(dispatch, addToast, {
        forecastCycle: forecastCycleRef.current,
        discussionDraftsByScope: initialDraftsRef.current,
        onCloudCycleLoaded: onCloudCycleLoadedRef.current,
      }, userId));
    } catch {
      setRestoredSession(false);
    } finally {
      setRestoreAttempted(true);
    }
  }, [addToast, dispatch, userId]);

  useEffect(() => {
    if (restoreAttempted) setRestoreComplete(true);
  }, [restoreAttempted]);

  return { restoreComplete, restoredSession };
};

export const useUnsavedChangesWarning = (isSaved: boolean) => {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isSaved) {
        const message = 'You have unsaved changes. Are you sure you want to leave?';
        event.returnValue = message;
        return message;
      }
      return undefined;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSaved]);
};

interface RolloverStorageSnapshot {
  today: string;
  scopedLastActiveKey: string;
  scopedPromptedKey: string;
  legacyLastActiveDay: string | null;
  legacyPromptedDay: string | null;
  scopedLastActiveDay: string | null;
  lastActiveDay: string | null;
  alreadyPromptedToday: boolean;
  existingPendingPrompt: DayRolloverPromptState | null;
}

const readRolloverStorageSnapshot = (userId: string | null | undefined, today: string): RolloverStorageSnapshot => {
  const scopedLastActiveKey = getRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, userId);
  const scopedPromptedKey = getRolloverStorageKey(DAY_ROLLOVER_PROMPTED_KEY, userId);
  const legacyLastActiveDay = userId ? null : readStoredDayValue(DAY_ROLLOVER_LAST_ACTIVE_KEY);
  const legacyPromptedDay = userId ? null : readStoredDayValue(DAY_ROLLOVER_PROMPTED_KEY);
  const scopedLastActiveDay = readStoredDayValue(scopedLastActiveKey);
  const promptedDay = readStoredDayValue(scopedPromptedKey) ?? legacyPromptedDay;

  return {
    today,
    scopedLastActiveKey,
    scopedPromptedKey,
    legacyLastActiveDay,
    legacyPromptedDay,
    scopedLastActiveDay,
    lastActiveDay: scopedLastActiveDay ?? legacyLastActiveDay,
    alreadyPromptedToday: promptedDay === today,
    existingPendingPrompt: readStoredRolloverPrompt(userId),
  };
};

const deriveLegacyRolloverPrompt = ({ today, legacyLastActiveDay, legacyPromptedDay, existingPendingPrompt }: RolloverStorageSnapshot): DayRolloverPromptState | null => {
  if (existingPendingPrompt) return existingPendingPrompt;
  if (legacyPromptedDay !== today || !legacyLastActiveDay || legacyLastActiveDay === today) return null;
  return { previousDay: legacyLastActiveDay, currentDay: today };
};

const migrateLegacyRolloverStorage = (
  userId: string | null | undefined,
  snapshot: RolloverStorageSnapshot,
  pendingPrompt: DayRolloverPromptState | null,
): void => {
  if (!userId && snapshot.legacyLastActiveDay && !snapshot.scopedLastActiveDay) {
    writeStoredDayValue(snapshot.scopedLastActiveKey, snapshot.legacyLastActiveDay);
  }
  if (pendingPrompt && !snapshot.existingPendingPrompt) writeStoredRolloverPrompt(pendingPrompt, userId);
};

const getDayRolloverSnapshot = (userId?: string | null) => {
  const snapshot = readRolloverStorageSnapshot(userId, getLocalCalendarDate());
  const pendingPrompt = deriveLegacyRolloverPrompt(snapshot);
  migrateLegacyRolloverStorage(userId, snapshot, pendingPrompt);
  return {
    today: snapshot.today,
    lastActiveDay: snapshot.lastActiveDay,
    alreadyPromptedToday: snapshot.alreadyPromptedToday,
    pendingPrompt,
  };
};

export const shouldSkipDayRolloverPrompt = ({ restoreComplete, lastActiveDay, today, alreadyPromptedToday, promptOpen, hasUnsavedWork }: {
  restoreComplete: boolean;
  lastActiveDay: string | null;
  today: string;
  alreadyPromptedToday: boolean;
  promptOpen: boolean;
  hasUnsavedWork: boolean;
}) => !restoreComplete || !lastActiveDay || lastActiveDay === today || alreadyPromptedToday || promptOpen || !hasUnsavedWork;

export const getDayRolloverPromptState = ({ restoreComplete, lastActiveDay, today, alreadyPromptedToday, promptOpen, forecastCycle, isSaved, pendingPrompt }: {
  restoreComplete: boolean;
  lastActiveDay: string | null;
  today: string;
  alreadyPromptedToday: boolean;
  promptOpen: boolean;
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  isSaved: boolean;
  pendingPrompt?: DayRolloverPromptState | null;
}): DayRolloverPromptState | null => {
  if (restoreComplete && !promptOpen && pendingPrompt?.currentDay === today) return pendingPrompt;
  if (shouldSkipDayRolloverPrompt({ restoreComplete, lastActiveDay, today, alreadyPromptedToday, promptOpen, hasUnsavedWork: hasUnsavedRolloverCandidateSession(forecastCycle, isSaved) })) return null;
  return { previousDay: lastActiveDay as string, currentDay: today };
};

export const runDayRolloverSaveAction = ({ forecastCycle, isSaved, dispatch }: { forecastCycle: ReturnType<typeof selectForecastCycle>; isSaved: boolean; dispatch: ShortcutDispatch }): boolean => {
  const didSaveSession = hasUnsavedRolloverCandidateSession(forecastCycle, isSaved);
  if (didSaveSession) dispatch(saveCurrentCycle({ label: buildRolloverSaveLabel(forecastCycle.cycleDate) }));
  dispatch(resetForecasts());
  return didSaveSession;
};

export const runDayRolloverDownloadAction = ({ forecastCycle, mapView, dispatch, clearCurrent }: { forecastCycle: ReturnType<typeof selectForecastCycle>; mapView: RootState['forecast']['currentMapView']; dispatch: ShortcutDispatch; clearCurrent?: UseCloudCyclesResult['clearCurrent'] }): boolean => {
  try {
    exportForecastToJson(forecastCycle, mapView);
    clearCurrent?.();
    dispatch(resetForecasts());
    return true;
  } catch {
    return false;
  }
};

export const runDayRolloverCloudSaveAction = async ({ forecastCycle, currentMapView, saveCycle, clearCurrent, dispatch }: { forecastCycle: ReturnType<typeof selectForecastCycle>; currentMapView: RootState['forecast']['currentMapView']; saveCycle: UseCloudCyclesResult['saveCycle']; clearCurrent: UseCloudCyclesResult['clearCurrent']; dispatch: ShortcutDispatch }): Promise<boolean> => {
  try {
    const success = await saveCycle(buildRolloverSaveLabel(forecastCycle.cycleDate), forecastCycle.cycleDate, countForecastMetrics(forecastCycle), serializeForecast(forecastCycle, currentMapView), undefined, { saveAsNew: true });
    if (!success) return false;
    clearCurrent();
    dispatch(resetForecasts());
    return true;
  } catch {
    return false;
  }
};

/** Owns day-rollover detection and the save/download/replace actions for the page. */
export const useDayRolloverPrompt = ({ restoreComplete, restoredSession, dispatch, addToast, forecastCycle, currentMapView, isSaved, userId, canSaveToCloud, saveCycle, clearCurrent }: {
  restoreComplete: boolean;
  restoredSession: boolean;
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  currentMapView: RootState['forecast']['currentMapView'];
  isSaved: boolean;
  userId?: string;
  canSaveToCloud: boolean;
  saveCycle: UseCloudCyclesResult['saveCycle'];
  clearCurrent: UseCloudCyclesResult['clearCurrent'];
}) => {
  const [promptState, setPromptState] = useState<DayRolloverPromptState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const forecastCycleRef = useRef(forecastCycle);
  const isSavedRef = useRef(isSaved);
  const restoredSessionRef = useRef(restoredSession);
  const promptStateRef = useRef(promptState);
  const previousUserIdRef = useRef(userId);

  useEffect(() => { if (previousUserIdRef.current !== userId) { previousUserIdRef.current = userId; setPromptState(null); setActionError(null); } }, [userId]);
  useEffect(() => { forecastCycleRef.current = forecastCycle; }, [forecastCycle]);
  useEffect(() => { isSavedRef.current = isSaved; }, [isSaved]);
  useEffect(() => { restoredSessionRef.current = restoredSession; }, [restoredSession]);
  useEffect(() => { promptStateRef.current = promptState; }, [promptState]);

  const detectDayRollover = useCallback(() => {
    const { today, lastActiveDay, alreadyPromptedToday, pendingPrompt } = getDayRolloverSnapshot(userId);
    const nextPromptState = getDayRolloverPromptState({ restoreComplete, lastActiveDay, today, alreadyPromptedToday, pendingPrompt, promptOpen: Boolean(promptStateRef.current), forecastCycle: forecastCycleRef.current, isSaved: isSavedRef.current && !restoredSessionRef.current });
    if (!nextPromptState) {
      if (restoreComplete) writeStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, userId), today);
      return;
    }
    writeStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_PROMPTED_KEY, userId), today);
    writeStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, userId), today);
    writeStoredRolloverPrompt(nextPromptState, userId);
    setActionError(null);
    setPromptState(nextPromptState);
  }, [restoreComplete, userId]);

  useEffect(() => {
    detectDayRollover();
    const handleVisibilityChange = () => { if (!document.hidden) detectDayRollover(); };
    const intervalId = window.setInterval(detectDayRollover, DAY_ROLLOVER_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => { window.clearInterval(intervalId); document.removeEventListener('visibilitychange', handleVisibilityChange); };
  }, [detectDayRollover]);

  const completeRollover = useCallback(() => { clearStoredRolloverPrompt(userId); setPromptState(null); setActionError(null); }, [userId]);
  const handleKeepCurrentSession = useCallback(() => completeRollover(), [completeRollover]);
  const handleDownloadAndStartNewDay = useCallback(() => {
    if (!runDayRolloverDownloadAction({ forecastCycle, mapView: currentMapView, dispatch, clearCurrent })) {
      setActionError('Unable to download this session. Your current forecast is still open.');
      return;
    }
    addToast('Forecast downloaded and a new day started.', 'success');
    completeRollover();
  }, [addToast, clearCurrent, completeRollover, currentMapView, dispatch, forecastCycle]);
  const handleSaveToCloudAndStartNewDay = useCallback(async () => {
    setIsBusy(true);
    setActionError(null);
    try {
      const success = await runDayRolloverCloudSaveAction({ forecastCycle, currentMapView, saveCycle, clearCurrent, dispatch });
      if (!success) {
        setActionError('Unable to save this session to the cloud. Your current forecast is still open.');
        return;
      }
      addToast('Session saved to the cloud and a new day started.', 'success');
      completeRollover();
    } finally {
      setIsBusy(false);
    }
  }, [addToast, clearCurrent, completeRollover, currentMapView, dispatch, forecastCycle, saveCycle]);
  const handleReplaceWithoutSaving = useCallback(() => {
    clearCurrent();
    dispatch(resetForecasts());
    addToast('Previous session replaced and a new forecast started.', 'success');
    completeRollover();
  }, [addToast, clearCurrent, completeRollover, dispatch]);

  return { promptState, canSaveToCloud, isBusy, error: actionError, handleKeepCurrentSession, handleDownloadAndStartNewDay, handleSaveToCloudAndStartNewDay, handleReplaceWithoutSaving };
};
