import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import type { Dispatch, UnknownAction } from 'redux';
import { ForecastMapHandle } from '../components/Map/ForecastMap';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { RootState } from '../store';
import {
  importForecastCycle,
  restoreForecastCycle,
  markAsSaved,
  resetForecasts,
  saveCurrentCycle,
  setMapView,
  setActiveOutlookType,
  setActiveProbability,
  toggleSignificant,
  setEmergencyMode,
  selectForecastCycle,
  selectCanRedo,
  selectCanUndo,
  setForecastDay,
  redoLastEdit,
  undoLastEdit,
  setWorkflowMetadata,
  clearWorkflowMetadata,
} from '../store/forecastSlice';
import { OutlookType, Probability, DayType, GFCForecastSaveData } from '../types/outlooks';
import { deserializeForecast, validateForecastData, exportForecastToJson, serializeForecast } from '../utils/fileUtils';
import {
  getFirstExposedOutlookType,
  shouldActivateEmergencyMode,
} from '../config/productExposureSelectors';
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
import useAutoCategorical from '../hooks/useAutoCategorical';
import { useAutoTstm } from '../hooks/useAutoTstm';
import AutoTstmWorkspaceTools from '../components/AutoTstm/AutoTstmWorkspaceTools';
import type { AddToastFn } from '../components/Layout';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import { useCloudCycles, type UseCloudCyclesResult } from '../hooks/useCloudCycles';
import { useCloudSync } from '../hooks/useCloudSync';
import { CloudToolbarButton } from '../components/CloudCycleManager/CloudToolbarButton';
import { countForecastMetrics } from '../utils/forecastMetrics';
import { getLocalCalendarDate } from '../utils/localDate';
import { hasAnyModifierKey, isTypingTarget, keyboardShortcutKey } from '../utils/keyboardShortcutKey';
import { useCustomProductForecastHandoff } from '../hooks/useCustomProductForecastHandoff';

export { hasAnyModifierKey, isTypingTarget, clearStoredRolloverPrompt, getRolloverStorageKey, readStoredDayValue, readStoredRolloverPrompt, writeStoredDayValue, writeStoredRolloverPrompt };
import { queueProductMetric } from '../utils/productMetrics';
import { ForecastTabbedToolbarLayout } from '../components/ForecastWorkspace/ForecastWorkspaceLayouts';
import ForecastWorkspaceModals from '../components/ForecastWorkspace/ForecastWorkspaceModals';
import { useForecastWorkspaceController } from '../components/ForecastWorkspace/useForecastWorkspaceController';
import {
  readStoredForecastUiVariant,
  resolveForecastUiVariant,
  type ForecastUiVariant,
} from '../utils/forecastUiVariant';
import './ForecastPage.css';

interface PageContext { addToast: AddToastFn; }

const renderForecastWorkspaceLayout = (
  variant: ForecastUiVariant,
  props: {
    mapRef: React.RefObject<ForecastMapHandle | null>;
    controller: ReturnType<typeof useForecastWorkspaceController>;
    autoTstmTools?: React.ReactNode;
    tstmPreviewFeatures?: ReturnType<typeof useAutoTstm>['previewFeatures'];
  }
) => {
  // Only the Tabbed Toolbar variant is supported now.
  return <ForecastTabbedToolbarLayout {...props} />;
};

// Helper to get probability list based on outlook type
export const getProbabilityList = (activeOutlookType: string) => {
  switch (activeOutlookType) {
    case 'categorical':
      return ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'] as readonly string[];
    case 'tornado':
      return ['2%', '5%', '10%', '15%', '30%', '45%', '60%'] as readonly string[];
    case 'wind':
    case 'hail':
      return ['5%', '15%', '30%', '45%', '60%'] as readonly string[];
    default:
      return [] as readonly string[];
  }
};

// Component for emergency mode message
const EmergencyModeMessage: React.FC = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-background">
    <div className="max-w-lg p-8 text-center">
      <h2 className="text-2xl font-bold text-foreground mb-4">⚠️ Application in Emergency Mode</h2>
      <p className="text-muted-foreground mb-4">
        All outlook types are currently disabled. This is typically done during critical maintenance 
        or when addressing severe issues.
      </p>
      <p className="text-muted-foreground mb-4">
        The application&apos;s drawing capabilities have been temporarily suspended. 
        Please check back later or contact the administrator.
      </p>
      <p className="text-muted-foreground">
        For more information visit the{' '}
        <a 
          href="https://github.com/WxboySuper/Graphical-Forecast-Creator/issues?q=is%3Aissue%20state%3Aopen%20label%3AEmergency"
          className="text-primary hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub repository
        </a>.
      </p>
    </div>
  </div>
);

/** Returns true when the forecast cycle contains any drawable outlook data or saved low-probability state. */
export const hasRolloverForecastData = (
  forecastCycle: ReturnType<typeof selectForecastCycle>
): boolean => countForecastMetrics(forecastCycle).forecastDays > 0;

/** Returns true when any forecast day already has discussion content attached. */
export const cycleHasDiscussionContent = (
  forecastCycle: ReturnType<typeof selectForecastCycle>
): boolean => Object.values(forecastCycle.days).some((dayData) => Boolean(dayData?.discussion));

/** Returns true when unpublished discussion drafts are still held in memory. */
export const hasUnpublishedDiscussionDrafts = (
  discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope']
): boolean => Object.keys(discussionDraftsByScope).length > 0;

/** Returns true when the current session has unsaved work worth saving during a day rollover. */
export const hasUnsavedRolloverCandidateSession = (
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  isSaved: boolean
): boolean => {
  if (isSaved) {
    return false;
  }

  return hasRolloverForecastData(forecastCycle) || cycleHasDiscussionContent(forecastCycle);
};

/** Builds a short Cycle History label for one rollover save action. */
export const buildRolloverSaveLabel = (cycleDate: string): string => {
  const parsedDate = new Date(`${cycleDate}T00:00:00`);
  const labelDate = Number.isNaN(parsedDate.getTime())
    ? cycleDate
    : parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Rollover save • ${labelDate}`;
};

/** Formats a stored YYYY-MM-DD value into a more readable date label for the dialog copy. */
export const formatRolloverDayLabel = (value: string): string => {
  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
};

/** Modal prompt shown when the editor detects the local day rolled over while an older session still has work. */
const DayRolloverDialog: React.FC<{
  promptState: DayRolloverPromptState | null;
  canSaveToCloud: boolean;
  isBusy: boolean;
  error: string | null;
  onKeepCurrentSession: () => void;
  onDownloadAndStartNewDay: () => void;
  onSaveToCloudAndStartNewDay: () => void;
  onReplaceWithoutSaving: () => void;
}> = ({
  promptState,
  canSaveToCloud,
  isBusy,
  error,
  onKeepCurrentSession,
  onDownloadAndStartNewDay,
  onSaveToCloudAndStartNewDay,
  onReplaceWithoutSaving,
}) => (
  <Dialog open={Boolean(promptState)} onOpenChange={(isOpen) => { if (!isOpen && !isBusy) onKeepCurrentSession(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New day detected</DialogTitle>
        <DialogDescription>
          {promptState ? (
            <>
              It looks like your current Forecast session is from {formatRolloverDayLabel(promptState.previousDay)} and today is{' '}
              {formatRolloverDayLabel(promptState.currentDay)}. Choose how to handle this session before starting today&apos;s forecast.
            </>
          ) : null}
        </DialogDescription>
      </DialogHeader>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-2">
        <Button variant="outline" onClick={onDownloadAndStartNewDay} disabled={isBusy}>
          Download a copy &amp; start new day
        </Button>
        <Button onClick={onSaveToCloudAndStartNewDay} disabled={isBusy || !canSaveToCloud}>
          {canSaveToCloud ? 'Save to premium cloud & start new day' : 'Premium cloud save unavailable'}
        </Button>
        <Button variant="secondary" onClick={onKeepCurrentSession} disabled={isBusy}>
          Keep for now
        </Button>
        <Button variant="ghost" onClick={onReplaceWithoutSaving} disabled={isBusy}>
          Replace without saving
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

/** Reads the current map view (center + zoom) from the map adapter; returns defaults if no adapter is mounted. */
export const buildMapView = (ref: React.RefObject<ForecastMapHandle | null>) => {
  const adapter = ref.current;
  if (!adapter) {
    return {
      center: [39.8283, -98.5795] as [number, number],
      zoom: 4
    };
  }

  return adapter.getView();
};

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

/** Reads and validates a forecast JSON file, returning the parsed payload or null on failure. */
export const parseLoadedForecast = async (
  file: File,
  addToast: AddToastFn
): Promise<LoadedForecastPayload | null> => {
  const text = await file.text();
  let data: unknown;

  try {
    data = JSON.parse(text);
  } catch {
    addToast('File is not valid JSON.', 'error');
    return null;
  }

  if (!validateForecastData(data)) {
    addToast('Invalid forecast data format.', 'error');
    return null;
  }

  return {
    rawData: data as LoadedForecastPayload['rawData'],
    deserializedCycle: deserializeForecast(data),
  };
};

/** Returns true if the given day data object contains at least one outlook map with features. */
export const dayHasAnyFeatures = (dayData: unknown): boolean => {
  if (!dayData || typeof dayData !== 'object') return false;

  const maps = Object.values(dayData as Record<string, { size?: number } | undefined>);
  return maps.some((outlookMap) => (outlookMap?.size ?? 0) > 0);
};

/** Dispatches the loaded forecast to Redux and updates the map view, auto-restoring center/zoom when available. */
const applyLoadedForecast = (
  payload: LoadedForecastPayload,
  dispatch: ShortcutDispatch,
  mapRef: React.RefObject<ForecastMapHandle | null>
) => {
  dispatch(importForecastCycle(payload.deserializedCycle));
  if (payload.rawData.cycleMetadata) {
    dispatch(setWorkflowMetadata(payload.rawData.cycleMetadata));
  } else if (payload.rawData.cycleMetadata === null) {
    dispatch(clearWorkflowMetadata());
  }

  if (payload.rawData.mapView) {
    dispatch(setMapView(payload.rawData.mapView));
    return;
  }

  const map = mapRef.current?.getMap();
  if (!map) return;

  const currentDayData = payload.deserializedCycle.days[payload.deserializedCycle.currentDay]?.data;
  if (dayHasAnyFeatures(currentDayData)) {
    dispatch(setMapView({
      center: [39.8283, -98.5795],
      zoom: 4
    }));
  }
};

/** Returns a memoized callback that serializes the current forecast cycle to JSON and marks the store as saved. */
const useForecastSaveAction = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  mapRef: React.RefObject<ForecastMapHandle | null>,
  user: ReturnType<typeof useAuth>['user'],
  workflowMetadata?: import('../types/workflow').CycleMetadata
) => {
  return useCallback(() => {
    try {
      exportForecastToJson(forecastCycle, buildMapView(mapRef), workflowMetadata);
      dispatch(markAsSaved());
      queueProductMetric({ event: 'cycle_saved', user });
      addToast('Forecast exported to JSON!', 'success');
    } catch {
      addToast('Error exporting forecast.', 'error');
    }
  }, [forecastCycle, dispatch, addToast, mapRef, user, workflowMetadata]);
};

/** Returns a memoized async callback that parses and imports a forecast JSON file into Redux. */
const useForecastLoadAction = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  mapRef: React.RefObject<ForecastMapHandle | null>
) => {
  return useCallback(async (file: File) => {
    try {
      const payload = await parseLoadedForecast(file, addToast);
      if (!payload) return;

      applyLoadedForecast(payload, dispatch, mapRef);
      addToast('Forecast loaded successfully!', 'success');
    } catch {
      addToast('Error reading file.', 'error');
    }
  }, [dispatch, addToast, mapRef]);
};

const ARROW_KEYS = new Set(['arrowup', 'arrowright', 'arrowdown', 'arrowleft']);
const INCREASE_PROBABILITY_KEYS = new Set(['arrowup', 'arrowright']);
type ShortcutDispatch = Dispatch<UnknownAction>;

interface KeyboardShortcutContext {
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  isSaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  handleSave: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  currentDay: DayType;
  activeOutlookType: OutlookType;
  activeProbability: string;
  isSignificant: boolean;
}

type CommandShortcutKey = 's' | 'o' | 'l' | 'e';
type CommandShortcutHandler = (context: KeyboardShortcutContext) => void;

const OUTLOOK_SHORTCUTS: Record<string, { type: OutlookType; label: string }> = {
  t: { type: 'tornado', label: 'Tornado' },
  w: { type: 'wind', label: 'Wind' },
  h: { type: 'hail', label: 'Hail' },
  c: { type: 'categorical', label: 'Categorical' },
};

/** Normalises a probability string by converting legacy `#` suffix to `%` (e.g. `"10#"` → `"10%"`). */
export const normalizeProbability = (value: string): string => value.replace('#', '%');

/** Returns true if the current outlook type and probability support toggling the significant-threat flag. */
export const canToggleSignificantForState = (
  activeOutlookType: OutlookType,
  activeProbability: string
): boolean => {
  if (activeOutlookType === 'categorical') return false;
  if (activeOutlookType === 'tornado') return !['2%', '5%'].includes(activeProbability);
  return activeProbability !== '5%';
};

const COMMAND_SHORTCUT_HANDLERS: Record<CommandShortcutKey, CommandShortcutHandler> = {
  s: (context) => {
    if (!context.isSaved) {
      context.handleSave();
    }
  },
  o: (context) => {
    context.fileInputRef.current?.click();
  },
  l: (context) => {
    context.fileInputRef.current?.click();
  },
  e: (context) => {
    context.mapRef.current?.getMap();
  },
};

/** Type-guard that narrows a key string to the set of recognised Ctrl/Cmd shortcut keys. */
const isCommandShortcutKey = (key: string): key is CommandShortcutKey => {
  return key === 's' || key === 'o' || key === 'l' || key === 'e';
};

type UndoRedoAction = 'undo' | 'redo' | null;

/** Resolves whether the current modifier/key combination should undo, redo, or do nothing. */
export const getUndoRedoAction = (e: KeyboardEvent, key: string): UndoRedoAction => {
  if (!(e.ctrlKey || e.metaKey)) return null;
  if (key === 'y') return 'redo';
  if (key !== 'z') return null;
  return e.shiftKey ? 'redo' : 'undo';
};

/** Dispatches an undo/redo action only when that action is currently available in history. */
const dispatchUndoRedoAction = (
  action: Exclude<UndoRedoAction, null>,
  context: KeyboardShortcutContext
) => {
  if (action === 'undo') {
    if (context.canUndo) {
      context.dispatch(undoLastEdit());
    }
    return;
  }

  if (context.canRedo) {
    context.dispatch(redoLastEdit());
  }
};

/** Handles the app-level undo/redo shortcuts before browser defaults can consume them. */
const handleUndoRedoShortcuts = (
  e: KeyboardEvent,
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  const action = getUndoRedoAction(e, key);
  if (!action) return false;

  e.preventDefault();
  dispatchUndoRedoAction(action, context);
  return true;
};

/** Handles Ctrl/Cmd shortcut keys (save, open, load, export); returns true if the key was handled. */
const handleCommandShortcuts = (
  e: KeyboardEvent,
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  if (!(e.ctrlKey || e.metaKey)) return false;
  if (!isCommandShortcutKey(key)) return false;

  const runShortcut = COMMAND_SHORTCUT_HANDLERS[key];
  e.preventDefault();
  runShortcut(context);
  return true;
};

/** Switches the active forecast day when a digit key 1–8 is pressed; returns true if handled. */
const handleDayShortcut = (
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  if (!/^[1-8]$/.test(key)) return false;

  const day = parseInt(key, 10) as DayType;
  if (context.currentDay !== day) {
    context.dispatch(setForecastDay(day));
    context.addToast(`Switched to Day ${day}`, 'info');
  }
  return true;
};

/** Switches to a specific outlook type when its letter shortcut (t/w/h/c) is pressed; returns true if handled. */
const handleOutlookShortcut = (
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  const shortcut = OUTLOOK_SHORTCUTS[key];
  if (!shortcut) return false;

  if (context.activeOutlookType !== shortcut.type) {
    context.dispatch(setActiveOutlookType(shortcut.type));
    context.addToast(`Switched to ${shortcut.label} outlook`, 'info');
  }
  return true;
};

/** Sets the active probability to TSTM when `g` is pressed in categorical mode; returns true if handled. */
const handleGeneralThunderstormShortcut = (
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  if (key !== 'g') return false;

  if (context.activeOutlookType === 'categorical') {
    context.dispatch(setActiveProbability('TSTM'));
    context.addToast('Added General Thunderstorm risk', 'info');
  }
  return true;
};

/** Toggles the significant-threat flag when `s` is pressed (without Ctrl); returns true if handled. */
const handleSignificantShortcut = (
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  if (key !== 's') return false;

  if (!canToggleSignificantForState(context.activeOutlookType, context.activeProbability)) return true;

  let threatStateLabel = 'Enabled';
  if (context.isSignificant) {
    threatStateLabel = 'Disabled';
  }

  context.dispatch(toggleSignificant());
  context.addToast(`${threatStateLabel} significant threat`, 'info');
  return true;
};

/** Computes the next probability step from an arrow-key press; returns the step or null if at a boundary. */
const getArrowProbabilityStep = (
  key: string,
  context: KeyboardShortcutContext
): { nextProbability: string; directionLabel: 'Increased' | 'Decreased' } | null => {
  const probabilities = getProbabilityList(context.activeOutlookType);
  const currentIndex = probabilities.indexOf(normalizeProbability(context.activeProbability));
  if (currentIndex === -1) return null;

  const isUp = INCREASE_PROBABILITY_KEYS.has(key);
  const nextProbability = probabilities[isUp ? currentIndex + 1 : currentIndex - 1];
  if (!nextProbability) return null;

  return {
    nextProbability,
    directionLabel: isUp ? 'Increased' : 'Decreased'
  };
};

/** Handles arrow-key presses to step the active probability up or down; returns true if handled. */
const handleArrowProbabilityShortcut = (
  key: string,
  context: KeyboardShortcutContext
): boolean => {
  if (!ARROW_KEYS.has(key)) return false;

  const step = getArrowProbabilityStep(key, context);
  if (!step) return true;

  context.dispatch(setActiveProbability(step.nextProbability as Probability));
  context.addToast(`${step.directionLabel} to ${step.nextProbability}`, 'info');
  return true;
};

/** Dispatches the first matching standard shortcut handler (day, outlook type, TSTM, significant, arrow keys). */
const handleStandardShortcuts = (
  key: string,
  context: KeyboardShortcutContext
) => {
  const shortCircuitHandlers: Array<(shortcutKey: string, shortcutContext: KeyboardShortcutContext) => boolean> = [
    handleDayShortcut,
    handleOutlookShortcut,
    handleGeneralThunderstormShortcut,
    handleSignificantShortcut,
  ];

  const wasHandled = shortCircuitHandlers.some((handler) => handler(key, context));
  if (!wasHandled) {
    handleArrowProbabilityShortcut(key, context);
  }
};

/** Central keydown router: runs command shortcuts first, then standard shortcuts, skipping typing targets. */
export const processShortcutKeyDown = (
  e: KeyboardEvent,
  context: KeyboardShortcutContext
) => {
  const key = keyboardShortcutKey(e);
  if (!key) return;
  if (isTypingTarget(e.target)) return;

  if (handleUndoRedoShortcuts(e, key, context)) return;
  if (handleCommandShortcuts(e, key, context)) return;
  if (hasAnyModifierKey(e)) return;

  handleStandardShortcuts(key, context);
};

/** Syncs the Redux active outlook type and emergency mode from build-target exposure. */
const useOutlookExposureSync = (dispatch: ShortcutDispatch) => {
  useEffect(() => {
    dispatch(setEmergencyMode(shouldActivateEmergencyMode()));
    dispatch(setActiveOutlookType(getFirstExposedOutlookType()));
  }, [dispatch]);
};

/** Reads and validates one stored forecast payload string from browser storage. */
export const parseStoredForecastPayload = (storedValue: string | null): GFCForecastSaveData | null => {
  if (!storedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedValue) as unknown;
    return validateForecastData(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** Applies one stored forecast payload into Redux and restores the saved map view when present. */
const restoreStoredForecastPayload = (
  data: GFCForecastSaveData,
  dispatch: ShortcutDispatch,
  preserveDiscussionDrafts = false,
) => {
  const deserializedCycle = deserializeForecast(data);
  dispatch(preserveDiscussionDrafts ? restoreForecastCycle(deserializedCycle, true) : importForecastCycle(deserializedCycle));
  if (data.cycleMetadata) {
    dispatch(setWorkflowMetadata(data.cycleMetadata));
  } else if (data.cycleMetadata === null) {
    dispatch(clearWorkflowMetadata());
  }
  const rawData = data as LoadedForecastPayload['rawData'];
  if (rawData.mapView) {
    dispatch(setMapView(rawData.mapView));
  }
};

/** Reads the stored cloud-cycle metadata payload when it exists and is well-formed. */
export const parseStoredCloudMeta = (storedValue: string | null): StoredCloudMeta | null => {
  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue) as StoredCloudMeta;
  } catch {
    return null;
  }
};

/** Clears the temporary session-storage keys used for handing a cloud cycle into the editor. */
export const clearStoredCloudSession = (userId?: string | null) => {
  sessionStorage.removeItem(getScopedStorageKey(CLOUD_CYCLE_PAYLOAD_KEY, getStorageScope(userId)));
  sessionStorage.removeItem(getScopedStorageKey(CLOUD_CYCLE_META_KEY, getStorageScope(userId)));
  if (!userId) {
    sessionStorage.removeItem(CLOUD_CYCLE_PAYLOAD_KEY);
    sessionStorage.removeItem(CLOUD_CYCLE_META_KEY);
  }
};

/** Returns true when stored cloud metadata includes the id and label needed to restore selection context. */
export const hasRestorableCloudSelection = (
  cloudMeta: StoredCloudMeta | null
): cloudMeta is Required<Pick<StoredCloudMeta, 'id' | 'label'>> => Boolean(cloudMeta?.id && cloudMeta.label);

/** Notifies the forecast page about the cloud cycle that was just restored when metadata is complete. */
const restoreCloudSelectionContext = (
  cloudMeta: StoredCloudMeta | null,
  onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void
) => {
  if (!onCloudCycleLoaded || !hasRestorableCloudSelection(cloudMeta)) {
    return;
  }

  onCloudCycleLoaded({ id: cloudMeta.id, label: cloudMeta.label });
};

/** Restores a cloud-loaded forecast from session storage when one is waiting to be opened. */
const restoreCloudSession = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void,
  userId?: string | null
): boolean => {
  const scopedPayloadKey = getScopedStorageKey(CLOUD_CYCLE_PAYLOAD_KEY, getStorageScope(userId));
  const cloudPayloadStr = sessionStorage.getItem(scopedPayloadKey)
    ?? (!userId ? sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY) : null);
  const data = parseStoredForecastPayload(cloudPayloadStr);
  if (!data) {
    return false;
  }

  const scopedMetaKey = getScopedStorageKey(CLOUD_CYCLE_META_KEY, getStorageScope(userId));
  const cloudMeta = parseStoredCloudMeta(sessionStorage.getItem(scopedMetaKey)
    ?? (!userId ? sessionStorage.getItem(CLOUD_CYCLE_META_KEY) : null));

  restoreStoredForecastPayload(data, dispatch);
  restoreCloudSelectionContext(cloudMeta, onCloudCycleLoaded);
  clearStoredCloudSession(userId);
  addToast('Cloud forecast loaded successfully.', 'success');
  return true;
};

/** Returns true when the current cycle already holds content (rolled over or discussion) that should not be clobbered by a local autosave restore. */
const shouldSkipLocalRestore = (
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope'],
): boolean =>
  hasRolloverForecastData(forecastCycle)
  || cycleHasDiscussionContent(forecastCycle)
  || hasUnpublishedDiscussionDrafts(discussionDraftsByScope);

/** Copies a legacy auto-save into the signed-in scope and removes the unscoped copy. */
const copyLegacyAutoSaveToScopedStorage = (scopedKey: string, legacyValue: string | null): void => {
  if (legacyValue === null) return;
  localStorage.setItem(scopedKey, legacyValue);
  localStorage.removeItem('forecastData');
};

/** Returns true when a legacy autosave should be copied into the signed-in scope. */
const shouldCopyLegacyAutoSaveToScoped = (
  userId: string | null | undefined,
  legacyValue: string | null,
  storedValue: string | null,
): boolean => {
  if (!userId) return false;
  if (legacyValue === null) return false;
  return storedValue === legacyValue;
};

/** Restores the last local auto-saved forecast when no cloud-loaded payload is pending. */
const restoreLocalSession = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  currentSession: {
    forecastCycle: ReturnType<typeof selectForecastCycle>;
    discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope'];
  },
  userId?: string | null
): boolean => {
  if (shouldSkipLocalRestore(currentSession.forecastCycle, currentSession.discussionDraftsByScope)) return false;

  const scopedKey = getAutoSaveStorageKey(userId);
  const scopedValue = localStorage.getItem(scopedKey);
  const legacyValue = userId ? localStorage.getItem('forecastData') : null;
  const storedValue = userId ? selectPreferredAutoSaveValue(scopedValue, legacyValue) : scopedValue;
  const data = parseStoredForecastPayload(storedValue);
  if (!data) return false;

  if (shouldCopyLegacyAutoSaveToScoped(userId, legacyValue, storedValue)) {
    copyLegacyAutoSaveToScopedStorage(scopedKey, legacyValue);
  }
  restoreStoredForecastPayload(data, dispatch, true);
  addToast('Session restored from auto-save.', 'success');
  return true;
};

/** Restores a pending cloud session first, then falls back to the local auto-save snapshot. */
const restoreAvailableSession = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  currentSession: {
    forecastCycle: ReturnType<typeof selectForecastCycle>;
    discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope'];
    onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void;
  },
  userId?: string | null
): boolean => {
  const restoredCloudSession = restoreCloudSession(dispatch, addToast, currentSession.onCloudCycleLoaded, userId);
  if (restoredCloudSession) {
    return true;
  }

  return restoreLocalSession(dispatch, addToast, currentSession, userId);
};

/** Attempts to restore the last auto-saved forecast session from localStorage on mount. */
const useSessionRestore = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  currentSession: {
    forecastCycle: ReturnType<typeof selectForecastCycle>;
    discussionDraftsByScope: RootState['forecast']['discussionDraftsByScope'];
    currentMapView: RootState['forecast']['currentMapView'];
    workflowMetadata: RootState['forecast']['workflowMetadata'];
    onCloudCycleLoaded?: (cloudCycle: { id: string; label: string }) => void;
  },
  userId?: string | null
) => {
  const onCloudCycleLoadedRef = useRef(currentSession.onCloudCycleLoaded);
  const forecastCycleRef = useRef(currentSession.forecastCycle);
  const initialDraftsRef = useRef(currentSession.discussionDraftsByScope);
  const currentMapViewRef = useRef(currentSession.currentMapView);
  const workflowMetadataRef = useRef(currentSession.workflowMetadata);
  const previousUserIdRef = useRef(userId);
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

/** Registers a beforeunload listener to warn the user when the forecast has unsaved changes. */
const useUnsavedChangesWarning = (isSaved: boolean) => {
  useEffect(() => {
    /** Shows the browser's native leave-confirmation dialog when there are unsaved changes. */
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isSaved) {
        const message = 'You have unsaved changes. Are you sure you want to leave?';
        e.returnValue = message;
        return message;
      }
      return undefined;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isSaved]);
};

/** Returns true when legacy rollover keys describe a prompt for today. */
const isLegacyPromptForToday = (today: string, legacyPromptedDay: string | null): boolean => legacyPromptedDay === today;

/** Returns true when a legacy active day exists and differs from today. */
/** Returns true when a legacy last-active day exists and differs from today. */
const hasPriorLegacyDay = (today: string, legacyLastActiveDay: string | null): legacyLastActiveDay is string => Boolean(legacyLastActiveDay) && legacyLastActiveDay !== today;

/** Returns a pending prompt reconstructed from legacy rollover keys when needed. */
const getLegacyPendingRolloverPrompt = (
  today: string,
  legacyLastActiveDay: string | null,
  legacyPromptedDay: string | null,
): DayRolloverPromptState | null => {
  if (!isLegacyPromptForToday(today, legacyPromptedDay)) return null;
  if (!hasPriorLegacyDay(today, legacyLastActiveDay)) return null;
  return { previousDay: legacyLastActiveDay, currentDay: today };
};

/** Returns true when the anonymous baseline can be copied into its scoped key. */
const canMigrateLegacyRolloverBaseline = (
  userId: string | null | undefined,
  legacyLastActiveDay: string | null,
  scopedLastActiveDay: string | null,
): legacyLastActiveDay is string => !userId && Boolean(legacyLastActiveDay) && !scopedLastActiveDay;

/** Copies the anonymous rollover baseline into its scoped key during migration. */
const migrateLegacyRolloverBaseline = (
  userId: string | null | undefined,
  scopedLastActiveKey: string,
  legacyLastActiveDay: string | null,
  scopedLastActiveDay: string | null,
): void => {
  if (!canMigrateLegacyRolloverBaseline(userId, legacyLastActiveDay, scopedLastActiveDay)) return;
  writeStoredDayValue(scopedLastActiveKey, legacyLastActiveDay);
};

/** Reads the stored day-rollover snapshot without mutating the baseline used by the decision. */
const getDayRolloverSnapshot = (userId?: string | null) => {
  const today = getLocalCalendarDate();
  const scopedLastActiveKey = getRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, userId);
  const scopedPromptedKey = getRolloverStorageKey(DAY_ROLLOVER_PROMPTED_KEY, userId);
  const legacyLastActiveDay = userId ? null : readStoredDayValue(DAY_ROLLOVER_LAST_ACTIVE_KEY);
  const legacyPromptedDay = userId ? null : readStoredDayValue(DAY_ROLLOVER_PROMPTED_KEY);
  const scopedLastActiveDay = readStoredDayValue(scopedLastActiveKey);
  const lastActiveDay = scopedLastActiveDay ?? legacyLastActiveDay;
  const alreadyPromptedToday = (readStoredDayValue(scopedPromptedKey) ?? legacyPromptedDay) === today;
  const existingPendingPrompt = readStoredRolloverPrompt(userId);
  const pendingPrompt = existingPendingPrompt ?? getLegacyPendingRolloverPrompt(today, legacyLastActiveDay, legacyPromptedDay);

  migrateLegacyRolloverBaseline(userId, scopedLastActiveKey, legacyLastActiveDay, scopedLastActiveDay);
  if (pendingPrompt && !existingPendingPrompt) {
    writeStoredRolloverPrompt(pendingPrompt, userId);
  }

  return { today, lastActiveDay, alreadyPromptedToday, pendingPrompt };
};

/** Returns true when the day-rollover modal should not be shown for the current snapshot. */
export const shouldSkipDayRolloverPrompt = ({
  restoreComplete,
  lastActiveDay,
  today,
  alreadyPromptedToday,
  promptOpen,
  hasUnsavedWork,
}: {
  restoreComplete: boolean;
  lastActiveDay: string | null;
  today: string;
  alreadyPromptedToday: boolean;
  promptOpen: boolean;
  hasUnsavedWork: boolean;
}) => {
  if (!restoreComplete) {
    return true;
  }

  if (!lastActiveDay || lastActiveDay === today) {
    return true;
  }

  if (alreadyPromptedToday || promptOpen) {
    return true;
  }

  return !hasUnsavedWork;
};

/** Returns true when a stored pending prompt can be reused for the current day. */
const isCurrentPendingRolloverPrompt = (
  restoreComplete: boolean,
  pendingPrompt: DayRolloverPromptState | null | undefined,
  today: string,
  promptOpen: boolean,
): pendingPrompt is DayRolloverPromptState => restoreComplete && !promptOpen && pendingPrompt?.currentDay === today;

/** Saves the previous cycle when needed, resets the editor, and returns whether a history save occurred. */
export const getDayRolloverPromptState = ({
  restoreComplete,
  lastActiveDay,
  today,
  alreadyPromptedToday,
  promptOpen,
  forecastCycle,
  isSaved,
  pendingPrompt,
}: {
  restoreComplete: boolean;
  lastActiveDay: string | null;
  today: string;
  alreadyPromptedToday: boolean;
  promptOpen: boolean;
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  isSaved: boolean;
  pendingPrompt?: DayRolloverPromptState | null;
}): DayRolloverPromptState | null => {
  const hasUnsavedWork = hasUnsavedRolloverCandidateSession(forecastCycle, isSaved);
  if (isCurrentPendingRolloverPrompt(restoreComplete, pendingPrompt, today, promptOpen)) return pendingPrompt;
  if (shouldSkipDayRolloverPrompt({
    restoreComplete,
    lastActiveDay,
    today,
    alreadyPromptedToday,
    promptOpen,
    hasUnsavedWork,
  })) return null;

  return { previousDay: lastActiveDay as string, currentDay: today };
};

/** Saves the current session to Cycle History when needed, then resets the editor for the new local day. */
export const runDayRolloverSaveAction = ({
  forecastCycle,
  isSaved,
  dispatch,
}: {
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  isSaved: boolean;
  dispatch: ShortcutDispatch;
}): boolean => {
  const didSaveSession = hasUnsavedRolloverCandidateSession(forecastCycle, isSaved);

  if (didSaveSession) {
    dispatch(saveCurrentCycle({ label: buildRolloverSaveLabel(forecastCycle.cycleDate) }));
  }

  dispatch(resetForecasts());
  return didSaveSession;
};

/** Downloads the rollover session and only resets the editor after the browser download succeeds. */
export const runDayRolloverDownloadAction = ({ forecastCycle, mapView, dispatch, clearCurrent }: {
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  mapView: RootState['forecast']['currentMapView'];
  dispatch: ShortcutDispatch;
  clearCurrent?: UseCloudCyclesResult['clearCurrent'];
}): boolean => {
  try {
    exportForecastToJson(forecastCycle, mapView);
    clearCurrent?.();
    dispatch(resetForecasts());
    return true;
  } catch { return false; }
};

/** Saves the rollover session as a new cloud cycle and resets only after a confirmed success. */
export const runDayRolloverCloudSaveAction = async ({ forecastCycle, currentMapView, saveCycle, clearCurrent, dispatch }: {
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  currentMapView: RootState['forecast']['currentMapView'];
  saveCycle: UseCloudCyclesResult['saveCycle'];
  clearCurrent: UseCloudCyclesResult['clearCurrent'];
  dispatch: ShortcutDispatch;
}): Promise<boolean> => {
  try {
    const success = await saveCycle(buildRolloverSaveLabel(forecastCycle.cycleDate), forecastCycle.cycleDate, countForecastMetrics(forecastCycle), serializeForecast(forecastCycle, currentMapView), undefined, { saveAsNew: true });
    if (!success) return false;
    clearCurrent();
    dispatch(resetForecasts());
    return true;
  } catch { return false; }
};

/** Stores the detected prompt and marks today's rollover check as handled. */
const persistDetectedRolloverPrompt = (prompt: DayRolloverPromptState, today: string, userId?: string): void => {
  writeStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_PROMPTED_KEY, userId), today);
  writeStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, userId), today);
  writeStoredRolloverPrompt(prompt, userId);
};

/** Applies one rollover detection result to storage and prompt state. */
const applyDayRolloverDetection = ({
  promptState,
  today,
  restoreComplete,
  userId,
  persistPrompt,
  setPromptState,
  setActionError,
}: {
  promptState: DayRolloverPromptState | null;
  today: string;
  restoreComplete: boolean;
  userId?: string;
  persistPrompt: (prompt: DayRolloverPromptState, today: string, userId?: string) => void;
  setPromptState: React.Dispatch<React.SetStateAction<DayRolloverPromptState | null>>;
  setActionError: React.Dispatch<React.SetStateAction<string | null>>;
}): void => {
  if (!promptState) {
    if (restoreComplete) {
      writeStoredDayValue(getRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, userId), today);
    }
    return;
  }

  persistPrompt(promptState, today, userId);
  setActionError(null);
  setPromptState(promptState);
};

/** Watches for a local calendar-day rollover and offers to save the previous session before starting a new one. */
const useDayRolloverPrompt = ({ restoreComplete, restoredSession, dispatch, addToast, forecastCycle, currentMapView, isSaved, userId, canSaveToCloud, saveCycle, clearCurrent }: {
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
    applyDayRolloverDetection({
      promptState: nextPromptState,
      today,
      restoreComplete,
      userId,
      persistPrompt: persistDetectedRolloverPrompt,
      setPromptState,
      setActionError,
    });
  }, [restoreComplete, restoredSession, userId]);

  useEffect(() => {
    detectDayRollover();
    /** Rechecks rollover state when the document becomes visible again. */
    const handleVisibilityChange = () => {
      if (!document.hidden) detectDayRollover();
    };
    const intervalId = window.setInterval(detectDayRollover, DAY_ROLLOVER_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [detectDayRollover]);

  const completeRollover = useCallback(() => { clearStoredRolloverPrompt(userId); setPromptState(null); setActionError(null); }, [userId]);
  const handleKeepCurrentSession = useCallback(() => completeRollover(), [completeRollover]);
  const handleDownloadAndStartNewDay = useCallback(() => {
    if (!runDayRolloverDownloadAction({ forecastCycle, mapView: currentMapView, dispatch, clearCurrent })) { setActionError('Unable to download this session. Your current forecast is still open.'); return; }
    addToast('Forecast downloaded and a new day started.', 'success');
    completeRollover();
  }, [addToast, clearCurrent, completeRollover, currentMapView, dispatch, forecastCycle]);
  const handleSaveToCloudAndStartNewDay = useCallback(async () => {
    setIsBusy(true); setActionError(null);
    try {
      const success = await runDayRolloverCloudSaveAction({ forecastCycle, currentMapView, saveCycle, clearCurrent, dispatch });
      if (!success) { setActionError('Unable to save this session to the cloud. Your current forecast is still open.'); return; }
      addToast('Session saved to the cloud and a new day started.', 'success');
      completeRollover();
    } finally { setIsBusy(false); }
  }, [addToast, clearCurrent, completeRollover, currentMapView, dispatch, forecastCycle, saveCycle]);
  const handleReplaceWithoutSaving = useCallback(() => { clearCurrent(); dispatch(resetForecasts()); addToast('Previous session replaced and a new forecast started.', 'success'); completeRollover(); }, [addToast, clearCurrent, completeRollover, dispatch]);

  return { promptState, canSaveToCloud, isBusy, error: actionError, handleKeepCurrentSession, handleDownloadAndStartNewDay, handleSaveToCloudAndStartNewDay, handleReplaceWithoutSaving };
};

/** Composes save, load, and file-input-change callbacks into a single hook return. */
const useForecastFileActions = (
  dispatch: ShortcutDispatch,
  addToast: AddToastFn,
  forecastCycle: ReturnType<typeof selectForecastCycle>,
  mapRef: React.RefObject<ForecastMapHandle | null>,
  user: ReturnType<typeof useAuth>['user'],
  workflowMetadata?: import('../types/workflow').CycleMetadata
) => {
  const handleSave = useForecastSaveAction(dispatch, addToast, forecastCycle, mapRef, user, workflowMetadata);
  const handleLoad = useForecastLoadAction(dispatch, addToast, mapRef);

  return { handleSave, handleLoad };
};

interface KeyboardShortcutHookParams {
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  drawingState: RootState['forecast']['drawingState'];
  isSaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  handleSave: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  currentDay: DayType;
}

/** Registers a keydown listener that processes all forecast keyboard shortcuts for the current context. */
const useKeyboardShortcuts = ({
  dispatch,
  addToast,
  drawingState,
  isSaved,
  canUndo,
  canRedo,
  handleSave,
  fileInputRef,
  mapRef,
  currentDay,
}: KeyboardShortcutHookParams) => {
  useEffect(() => {
    const { activeOutlookType, activeProbability, isSignificant } = drawingState;
    const shortcutContext: KeyboardShortcutContext = {
      dispatch,
      addToast,
      isSaved,
      canUndo,
      canRedo,
      handleSave,
      fileInputRef,
      mapRef,
      currentDay,
      activeOutlookType,
      activeProbability,
      isSignificant,
    };

    /** Processes each keydown event through the shortcut pipeline. */
    const handleKeyDown = (e: KeyboardEvent) => processShortcutKeyDown(e, shortcutContext);

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, addToast, drawingState, isSaved, canUndo, canRedo, handleSave, fileInputRef, mapRef, currentDay]);
};

/** Returns the cloud-cycle restore callback and cloud-save action used by the forecast toolbar. */
const useCloudForecastActions = ({
  addToast,
  currentMapView,
  forecastCycle,
  markAsCurrent,
  markCurrentStateSynced,
  saveCycle,
  userId,
  workflowMetadata,
}: {
  addToast: AddToastFn;
  currentMapView: RootState['forecast']['currentMapView'];
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  markAsCurrent: UseCloudCyclesResult['markAsCurrent'];
  markCurrentStateSynced: () => void;
  saveCycle: UseCloudCyclesResult['saveCycle'];
  userId: string | undefined;
  workflowMetadata?: import('../types/workflow').CycleMetadata;
}) => {
  const handleCloudCycleLoaded = useCallback(
    (cloudCycle: { id: string; label: string }) => {
      markAsCurrent(cloudCycle.id, cloudCycle.label);
      markCurrentStateSynced();
    },
    [markAsCurrent, markCurrentStateSynced]
  );

  const handleSaveToCloud = useCallback(
    async (label: string) => {
      if (!userId) {
        throw new Error('Sign in to save forecasts to the cloud.');
      }

      const payload = serializeForecast(forecastCycle, currentMapView, workflowMetadata);
      const stats = countForecastMetrics(forecastCycle);
      const success = await saveCycle(label, forecastCycle.cycleDate, stats, payload, workflowMetadata);

      if (!success) {
        throw new Error('Unable to save this forecast to the cloud right now.');
      }

      markCurrentStateSynced();
      addToast(`Saved "${label}" to the cloud.`, 'success');
    },
    [addToast, currentMapView, forecastCycle, markCurrentStateSynced, saveCycle, userId, workflowMetadata]
  );

  return {
    handleCloudCycleLoaded,
    handleSaveToCloud,
  };
};

/** Creates the cloud toolbar node so the page body stays focused on layout. */
const renderCloudToolbar = ({
  premiumActive,
  isExpiredPremium,
  forecastCycle,
  currentCloud,
  onSaveToCloud,
  onOpenCloudLibrary,
}: {
  premiumActive: boolean;
  isExpiredPremium: boolean;
  forecastCycle: ReturnType<typeof selectForecastCycle>;
  currentCloud: UseCloudCyclesResult['currentCloud'];
  onSaveToCloud: (label: string) => Promise<void>;
  onOpenCloudLibrary: () => void;
}) => (
  <CloudToolbarButton
    canSave={premiumActive}
    premiumActive={premiumActive}
    isExpiredPremium={isExpiredPremium}
    currentCycleDate={forecastCycle.cycleDate}
    currentCloudLabel={currentCloud?.label}
    syncState={currentCloud?.syncState}
    onSaveToCloud={onSaveToCloud}
    onOpenCloudLibrary={onOpenCloudLibrary}
  />
);

/** Composes the forecast page's cloud, file, and shortcut hooks into a single workspace model. */
const useForecastPageWorkspace = ({
  dispatch,
  addToast,
  navigate,
  mapRef,
  fileInputRef,
}: {
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  navigate: ReturnType<typeof useNavigate>;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) => {
  const forecastCycle = useSelector(selectForecastCycle);
  const discussionDraftsByScope = useSelector((state: RootState) => state.forecast.discussionDraftsByScope);
  const currentMapView = useSelector((state: RootState) => state.forecast.currentMapView);
  const isSaved = useSelector((state: RootState) => state.forecast.isSaved);
  const canUndo = useSelector(selectCanUndo);
  const canRedo = useSelector(selectCanRedo);
  const emergencyMode = useSelector((state: RootState) => state.forecast.emergencyMode);
  const drawingState = useSelector((state: RootState) => state.forecast.drawingState);
  const workflowMetadata = useSelector((state: RootState) => state.forecast.workflowMetadata);
  const { user } = useAuth();
  const { premiumActive, effectiveSource } = useEntitlement();
  const cloudCycles = useCloudCycles();
  const { currentCloud, saveCycle, markAsCurrent, clearCurrent } = cloudCycles;
  const cloudSync = useCloudSync(cloudCycles);
  const { markCurrentStateSynced } = cloudSync;
  const isExpiredPremium = !premiumActive && effectiveSource === 'stripe';

  useAutoCategorical();
  const autoTstm = useAutoTstm();
  useOutlookExposureSync(dispatch);

  const { handleCloudCycleLoaded, handleSaveToCloud } = useCloudForecastActions({
    addToast,
    currentMapView,
    forecastCycle,
    markAsCurrent,
    markCurrentStateSynced,
    saveCycle,
    userId: user?.uid,
    workflowMetadata,
  });

  const { restoreComplete, restoredSession } = useSessionRestore(dispatch, addToast, {
    forecastCycle,
    discussionDraftsByScope,
    currentMapView,
    workflowMetadata,
    onCloudCycleLoaded: handleCloudCycleLoaded,
  }, user?.uid);
  useUnsavedChangesWarning(isSaved);

  const { handleSave, handleLoad } = useForecastFileActions(
    dispatch,
    addToast,
    forecastCycle,
    mapRef,
    user,
    workflowMetadata
  );

  useKeyboardShortcuts({
    dispatch,
    addToast,
    drawingState,
    isSaved,
    canUndo,
    canRedo,
    handleSave,
    fileInputRef,
    mapRef,
    currentDay: forecastCycle.currentDay,
  });
  useCustomProductForecastHandoff(restoreComplete, addToast);

  const dayRolloverPrompt = useDayRolloverPrompt({
    restoreComplete,
    restoredSession,
    dispatch,
    addToast,
    forecastCycle,
    currentMapView,
    isSaved,
    userId: user?.uid,
    canSaveToCloud: premiumActive,
    saveCycle,
    clearCurrent,
  });

  const workspaceController = useForecastWorkspaceController({
    onSave: handleSave,
    onLoad: handleLoad,
    mapRef,
    fileInputRef,
    addToast,
    cloudTools: renderCloudToolbar({
      premiumActive,
      isExpiredPremium,
      forecastCycle,
      currentCloud,
      onSaveToCloud: handleSaveToCloud,
      onOpenCloudLibrary: () => navigate('/cloud'),
    }),
  });

  return {
    emergencyMode,
    dayRolloverPrompt,
    workspaceController,
    autoTstmTools: <AutoTstmWorkspaceTools autoTstm={autoTstm} />,
    tstmPreviewFeatures: autoTstm.previewFeatures,
  };
};

/** Root forecast page: mounts the full-screen map with the integrated toolbar and wires all hooks. */
export const ForecastPage: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useOutletContext<PageContext>();
  const { syncedSettings } = useAuth();
  const mapRef = useRef<ForecastMapHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    emergencyMode,
    dayRolloverPrompt,
    workspaceController,
    autoTstmTools,
    tstmPreviewFeatures,
  } = useForecastPageWorkspace({
    dispatch,
    addToast,
    navigate,
    mapRef,
    fileInputRef,
  });

  if (emergencyMode) {
    return <EmergencyModeMessage />;
  }

  const forecastUiVariant = resolveForecastUiVariant({
    search: location.search,
    syncedSettingValue: syncedSettings?.forecastUiVariant,
    storageValue: readStoredForecastUiVariant(),
  });

  return (
    <div className="forecast-page-shell">
      {renderForecastWorkspaceLayout(forecastUiVariant, {
        mapRef,
        controller: workspaceController,
        autoTstmTools,
        tstmPreviewFeatures,
      })}
      <ForecastWorkspaceModals controller={workspaceController} />
      <DayRolloverDialog
        promptState={dayRolloverPrompt.promptState}
        canSaveToCloud={dayRolloverPrompt.canSaveToCloud}
        isBusy={dayRolloverPrompt.isBusy}
        error={dayRolloverPrompt.error}
        onKeepCurrentSession={dayRolloverPrompt.handleKeepCurrentSession}
        onDownloadAndStartNewDay={dayRolloverPrompt.handleDownloadAndStartNewDay}
        onSaveToCloudAndStartNewDay={dayRolloverPrompt.handleSaveToCloudAndStartNewDay}
        onReplaceWithoutSaving={dayRolloverPrompt.handleReplaceWithoutSaving}
      />
    </div>
  );
};

export default ForecastPage;
