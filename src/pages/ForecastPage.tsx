import React, { useRef, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate, useOutletContext } from 'react-router';
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
} from '../store/forecastSlice';
import { OutlookType, Probability, DayType } from '../types/outlooks';
import { serializeForecast } from '../utils/fileUtils';
import {
  getFirstExposedOutlookType,
  shouldActivateEmergencyMode,
} from '../config/productExposureSelectors';
import {
  type DayRolloverPromptState,
  clearStoredRolloverPrompt,
  getRolloverStorageKey,
  readStoredDayValue,
  readStoredRolloverPrompt,
  writeStoredDayValue,
  writeStoredRolloverPrompt,
} from '../utils/dayRolloverStorage';
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
import { hasAnyModifierKey, isTypingTarget, keyboardShortcutKey } from '../utils/keyboardShortcutKey';
import { useCustomProductForecastHandoff } from '../hooks/useCustomProductForecastHandoff';

export { hasAnyModifierKey, isTypingTarget, clearStoredRolloverPrompt, getRolloverStorageKey, readStoredDayValue, readStoredRolloverPrompt, writeStoredDayValue, writeStoredRolloverPrompt };
import { ForecastTabbedToolbarLayout } from '../components/ForecastWorkspace/ForecastWorkspaceLayouts';
import ForecastWorkspaceModals from '../components/ForecastWorkspace/ForecastWorkspaceModals';
import { useForecastWorkspaceController } from '../components/ForecastWorkspace/useForecastWorkspaceController';
import {
  readStoredForecastUiVariant,
  resolveForecastUiVariant,
  type ForecastUiVariant,
} from '../utils/forecastUiVariant';
import {
  applyForecastImportResult,
  useForecastFileActions,
  useDayRolloverPrompt as useControllerDayRolloverPrompt,
  useSessionRestore as useControllerSessionRestore,
  useUnsavedChangesWarning as useControllerUnsavedChangesWarning,
} from './forecastPageController';
import { markAsSaved } from '../store/forecastSlice';
import type { ForecastImportResult, ForecastTransferFormat, ForecastTransferScope } from '../utils/forecastTransfer';
import { queueProductMetric } from '../utils/productMetrics';
export {
  buildMapView,
  dayHasAnyFeatures,
  parseLoadedForecast,
  hasRolloverForecastData,
  cycleHasDiscussionContent,
  hasUnpublishedDiscussionDrafts,
  hasUnsavedRolloverCandidateSession,
  buildRolloverSaveLabel,
  formatRolloverDayLabel,
  parseStoredForecastPayload,
  parseStoredCloudMeta,
  clearStoredCloudSession,
  hasRestorableCloudSelection,
  buildRestoreKey,
  shouldSkipDayRolloverPrompt,
  getDayRolloverPromptState,
  runDayRolloverSaveAction,
  runDayRolloverDownloadAction,
  runDayRolloverCloudSaveAction,
} from './forecastPageController';
import { formatRolloverDayLabel } from './forecastPageController';
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

const ARROW_KEYS = new Set(['arrowup', 'arrowright', 'arrowdown', 'arrowleft']);
const INCREASE_PROBABILITY_KEYS = new Set(['arrowup', 'arrowright']);
type ShortcutDispatch = Dispatch<UnknownAction>;

interface KeyboardShortcutContext {
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  canUndo: boolean;
  canRedo: boolean;
  onOpenTransferModal: (direction?: 'import' | 'export') => void;
  onSaveForecast: () => void;
  onInitiateExport: () => void;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  currentDay: DayType;
  activeOutlookType: OutlookType;
  activeProbability: string;
  isSignificant: boolean;
}

type CommandShortcutKey = 's' | 'o' | 'l' | 'e';
type CommandShortcutHandler = (context: KeyboardShortcutContext) => void;
type ShortcutInput = { key: string; context: KeyboardShortcutContext };
type ShortcutEventInput = ShortcutInput & { event: KeyboardEvent };

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
    context.onSaveForecast();
  },
  o: (context) => {
    context.onOpenTransferModal('import');
  },
  l: (context) => {
    context.onOpenTransferModal('import');
  },
  e: (context) => {
    context.onInitiateExport();
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
  { action, context }: { action: Exclude<UndoRedoAction, null>; context: KeyboardShortcutContext }
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
  { event, key, context }: ShortcutEventInput
): boolean => {
  const action = getUndoRedoAction(event, key);
  if (!action) return false;

  event.preventDefault();
  dispatchUndoRedoAction({ action, context });
  return true;
};

/** Handles Ctrl/Cmd shortcut keys (save, open, load, export); returns true if the key was handled. */
const handleCommandShortcuts = (
  { event, key, context }: ShortcutEventInput
): boolean => {
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (!isCommandShortcutKey(key)) return false;

  const runShortcut = COMMAND_SHORTCUT_HANDLERS[key];
  event.preventDefault();
  runShortcut(context);
  return true;
};

/** Switches the active forecast day when a digit key 1–8 is pressed; returns true if handled. */
const handleDayShortcut = ({ key, context }: ShortcutInput): boolean => {
  if (!/^[1-8]$/.test(key)) return false;

  const day = parseInt(key, 10) as DayType;
  if (context.currentDay !== day) {
    context.dispatch(setForecastDay(day));
    context.addToast(`Switched to Day ${day}`, 'info');
  }
  return true;
};

/** Switches to a specific outlook type when its letter shortcut (t/w/h/c) is pressed; returns true if handled. */
const handleOutlookShortcut = ({ key, context }: ShortcutInput): boolean => {
  const shortcut = OUTLOOK_SHORTCUTS[key];
  if (!shortcut) return false;

  if (context.activeOutlookType !== shortcut.type) {
    context.dispatch(setActiveOutlookType(shortcut.type));
    context.addToast(`Switched to ${shortcut.label} outlook`, 'info');
  }
  return true;
};

/** Sets the active probability to TSTM when `g` is pressed in categorical mode; returns true if handled. */
const handleGeneralThunderstormShortcut = ({ key, context }: ShortcutInput): boolean => {
  if (key !== 'g') return false;

  if (context.activeOutlookType === 'categorical') {
    context.dispatch(setActiveProbability('TSTM'));
    context.addToast('Added General Thunderstorm risk', 'info');
  }
  return true;
};

/** Toggles the significant-threat flag when `s` is pressed (without Ctrl); returns true if handled. */
const handleSignificantShortcut = ({ key, context }: ShortcutInput): boolean => {
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
const getArrowProbabilityStep = ({ key, context }: ShortcutInput): { nextProbability: string; directionLabel: 'Increased' | 'Decreased' } | null => {
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
const handleArrowProbabilityShortcut = ({ key, context }: ShortcutInput): boolean => {
  if (!ARROW_KEYS.has(key)) return false;

  const step = getArrowProbabilityStep({ key, context });
  if (!step) return true;

  context.dispatch(setActiveProbability(step.nextProbability as Probability));
  context.addToast(`${step.directionLabel} to ${step.nextProbability}`, 'info');
  return true;
};

/** Dispatches the first matching standard shortcut handler (day, outlook type, TSTM, significant, arrow keys). */
const handleStandardShortcuts = ({ key, context }: ShortcutInput) => {
  const shortCircuitHandlers: Array<(input: ShortcutInput) => boolean> = [
    handleDayShortcut,
    handleOutlookShortcut,
    handleGeneralThunderstormShortcut,
    handleSignificantShortcut,
  ];

  const input = { key, context };
  const wasHandled = shortCircuitHandlers.some((handler) => handler(input));
  if (!wasHandled) {
    handleArrowProbabilityShortcut(input);
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

  const input = { event: e, key, context };
  if (handleUndoRedoShortcuts(input)) return;
  if (handleCommandShortcuts(input)) return;
  if (hasAnyModifierKey(e)) return;

  handleStandardShortcuts({ key, context });
};

/** Syncs the Redux active outlook type and emergency mode from build-target exposure. */
const useOutlookExposureSync = (dispatch: ShortcutDispatch) => {
  useEffect(() => {
    dispatch(setEmergencyMode(shouldActivateEmergencyMode()));
    dispatch(setActiveOutlookType(getFirstExposedOutlookType()));
  }, [dispatch]);
};

interface KeyboardShortcutHookParams {
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  drawingState: RootState['forecast']['drawingState'];
  canUndo: boolean;
  canRedo: boolean;
  onOpenTransferModal: (direction?: 'import' | 'export') => void;
  onSaveForecast: () => void;
  onInitiateExport: () => void;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  currentDay: DayType;
}

/** Registers a keydown listener that processes all forecast keyboard shortcuts for the current context. */
const useKeyboardShortcuts = ({
  dispatch,
  addToast,
  drawingState,
  canUndo,
  canRedo,
  onOpenTransferModal,
  onSaveForecast,
  onInitiateExport,
  mapRef,
  currentDay,
}: KeyboardShortcutHookParams) => {
  useEffect(() => {
    const { activeOutlookType, activeProbability, isSignificant } = drawingState;
    const shortcutContext: KeyboardShortcutContext = {
      dispatch,
      addToast,
      canUndo,
      canRedo,
      onOpenTransferModal,
      onSaveForecast,
      onInitiateExport,
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
  }, [dispatch, addToast, drawingState, canUndo, canRedo, onOpenTransferModal, onSaveForecast, onInitiateExport, mapRef, currentDay]);
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
  onSaveForecast,
}: {
  dispatch: ShortcutDispatch;
  addToast: AddToastFn;
  navigate: ReturnType<typeof useNavigate>;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  onSaveForecast: () => void;
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

  const handleImportResult = useCallback((result: ForecastImportResult) => {
    applyForecastImportResult(result, dispatch, mapRef);
    const warningSuffix = result.warnings.length > 0
      ? ` (${result.warnings.length} import note${result.warnings.length === 1 ? '' : 's'})`
      : '';
    addToast(`Forecast imported from ${result.format.toUpperCase()}!${warningSuffix}`, 'success');
  }, [addToast, dispatch, mapRef]);

  const handleExportComplete = useCallback((format: ForecastTransferFormat, scope: ForecastTransferScope) => {
    if (format === 'json') {
      dispatch(markAsSaved());
      queueProductMetric({ event: 'cycle_saved', user });
      addToast('Forecast exported to JSON!', 'success');
      return;
    }

    if (format === 'package') {
      addToast(scope === 'workflow' ? 'Workflow package downloaded!' : 'Cycle package downloaded!', 'success');
      return;
    }

    const scopeLabel = scope === 'current-day' ? 'Current day' : 'Full cycle';
    addToast(`${scopeLabel} ${format.toUpperCase()} downloaded!`, 'success');
  }, [addToast, dispatch, user]);

  const handleTransferError = useCallback((message: string) => {
    addToast(message, 'error');
  }, [addToast]);

  const { restoreComplete, restoredSession } = useControllerSessionRestore(dispatch, addToast, {
    forecastCycle,
    discussionDraftsByScope,
    currentMapView,
    workflowMetadata,
    onCloudCycleLoaded: handleCloudCycleLoaded,
  }, user?.uid);
  useControllerUnsavedChangesWarning(isSaved);

  const workspaceController = useForecastWorkspaceController({
    mapRef,
    addToast,
    onImportResult: handleImportResult,
    onExportComplete: handleExportComplete,
    cloudTools: renderCloudToolbar({
      premiumActive,
      isExpiredPremium,
      forecastCycle,
      currentCloud,
      onSaveToCloud: handleSaveToCloud,
      onOpenCloudLibrary: () => navigate('/cloud'),
    }),
  });

  useKeyboardShortcuts({
    dispatch,
    addToast,
    drawingState,
    canUndo,
    canRedo,
    onOpenTransferModal: workspaceController.onOpenTransferModal,
    onSaveForecast,
    onInitiateExport: workspaceController.onInitiateExport,
    mapRef,
    currentDay: forecastCycle.currentDay,
  });
  useCustomProductForecastHandoff(restoreComplete, addToast);

  const dayRolloverPrompt = useControllerDayRolloverPrompt({
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

  return {
    emergencyMode,
    dayRolloverPrompt,
    workspaceController,
    handleTransferError,
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
  const { syncedSettings, user } = useAuth();
  const mapRef = useRef<ForecastMapHandle>(null);
  const forecastCycle = useSelector(selectForecastCycle);
  const workflowMetadata = useSelector((state: RootState) => state.forecast.workflowMetadata);
  const { handleSave } = useForecastFileActions(
    dispatch,
    addToast,
    forecastCycle,
    mapRef,
    user,
    workflowMetadata,
  );
  const {
    emergencyMode,
    dayRolloverPrompt,
    workspaceController,
    handleTransferError,
    autoTstmTools,
    tstmPreviewFeatures,
  } = useForecastPageWorkspace({
    dispatch,
    addToast,
    navigate,
    mapRef,
    onSaveForecast: handleSave,
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
      <ForecastWorkspaceModals controller={workspaceController} onTransferError={handleTransferError} />
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
