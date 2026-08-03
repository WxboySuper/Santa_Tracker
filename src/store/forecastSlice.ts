import '../immerSetup';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { OutlookData, OutlookType, DrawingState, ForecastCycle, DayType, OutlookDay, DiscussionData, DiscussionGrouping, Probability } from '../types/outlooks';
import type { CycleMetadata, WorkflowMetadata, Package, CycleValidationResult, StandardGrouping } from '../types/workflow';
import { normalizeForecastCycle } from '../utils/outlookMapCoercion';
import type { Feature } from 'geojson';
import type { CustomLayerCollection } from '../types/customProducts';
import { RootState } from './index'; // Need RootState for selectors
import { cloneForecastCycle } from '../utils/fileUtils';
import { countForecastMetrics } from '../utils/forecastMetrics';
import { createCustomLayerReducers } from './customLayerReducers';
import { createCustomCategoryReducers } from './customCategoryReducers';
import { createCustomFeatureReducers } from './customFeatureReducers';
import { getLocalCalendarDate } from '../utils/localDate';
import { areTstmFeaturesEqual } from '../utils/tstmGeneration';
import { validateCycleCompletion } from '../utils/completionValidation';
import { getWorkflowTemplateById } from '../components/ForecastWorkflow/workflowTemplates';
import { isValidDiscussionGroupings, mergeDiscussionDrafts, normalizeDiscussionGroupings } from '../utils/discussionGrouping';

export interface SavedCycleStats {
  forecastDays: number;
  totalOutlooks: number;
  totalFeatures: number;
}

export interface SavedCycle {
  id: string;
  timestamp: string;
  cycleDate: string;
  label?: string;
  forecastCycle: ForecastCycle;
  stats: SavedCycleStats;
  /** v2 workflow metadata for the cycle (optional, present for workflow-imported cycles). */
  workflowMetadata?: CycleMetadata;
}

export interface ForecastState {
  forecastCycle: ForecastCycle;
  drawingState: DrawingState;
  customEditor: {
    mode: 'severe' | 'custom';
    activeLayerId: string | null;
    activeCategoryId: string | null;
  };
  currentMapView: {
    center: [number, number]; // [latitude, longitude]
    zoom: number;
  };
  isSaved: boolean;
  emergencyMode: boolean;
  savedCycles: SavedCycle[];
  historyByDay: Partial<Record<DayType, ForecastHistoryStacks>>;
  /** Unsaved discussion editor drafts, keyed by grouping id so shared owner days cannot collide. */
  discussionDraftsByScope: Record<string, DiscussionData>;
  /** v2 workflow metadata for the active cycle (optional, present when loaded from a workflow package). */
  workflowMetadata?: CycleMetadata;
  /** v2 workflow template metadata (optional, present when the editor is in workflow mode). */
  workflowTemplate?: WorkflowMetadata;
  /** Whether the forecast workflow shell should be active across routes. */
  isWorkflowActive: boolean;
  completionValidation: {
    lastResult: CycleValidationResult | null;
    showCompletionModal: boolean;
    omittedDays: Partial<Record<DayType, string>>;
  };
  /** v2 outlook version snapshots for the active cycle (used for same-cycle updates). */
  outlookVersionSnapshots: OutlookVersionSnapshot[];
}

interface ForecastDaySnapshot {
  day: DayType;
  data: OutlookData;
  lowProbabilityOutlooks: OutlookType[];
  customLayers?: CustomLayerCollection;
}

interface ForecastHistoryEntry {
  day: DayType;
  snapshot: ForecastDaySnapshot;
}

interface ForecastHistoryStacks {
  undoStack: ForecastHistoryEntry[];
  redoStack: ForecastHistoryEntry[];
}

/** Stores a snapshot of outlook data for a specific version within a cycle. */
interface OutlookVersionSnapshot {
  /** Version number within the cycle. */
  version: number;
  /** Snapshot of day data for this version. */
  days: Partial<Record<DayType, OutlookDay>>;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

type DayBucket = 'day12' | 'day3' | 'day48';

interface CopyFeatureRule {
  sourceType: OutlookType;
  targetType: OutlookType;
}

const HISTORY_LIMIT = 50;
const WORKFLOW_ACTIVE_STORAGE_KEY = 'gfc-active-forecast-workflow';
const ALL_OUTLOOK_TYPES: OutlookType[] = [
  'tornado',
  'wind',
  'hail',
  'categorical',
  'totalSevere',
  'day4-8',
];
const DIRECT_DAY12_COPY_TYPES: OutlookType[] = ['tornado', 'wind', 'hail', 'categorical'];

/** Reads the persisted workflow-active flag from localStorage, returning false when storage is blocked or unset. */
const readStoredWorkflowActive = (): boolean => {
  try {
    return localStorage.getItem(WORKFLOW_ACTIVE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

/** Persists or clears the workflow-active flag in localStorage, swallowing storage errors to keep the workflow usable. */
const writeStoredWorkflowActive = (isActive: boolean) => {
  try {
    if (isActive) {
      localStorage.setItem(WORKFLOW_ACTIVE_STORAGE_KEY, 'true');
      return;
    }
    localStorage.removeItem(WORKFLOW_ACTIVE_STORAGE_KEY);
  } catch {
    // Keep workflow state usable when storage is blocked.
  }
};

/** Resolves the starting forecast day implied by a workflow template's first grouping, defaulting to day 1. */
const getWorkflowStartDay = (template?: WorkflowMetadata): DayType => {
  const firstGrouping = template?.groupings[0];
  if (firstGrouping === 'day2') return 2;
  if (firstGrouping === 'day3') return 3;
  if (firstGrouping === 'day4-8') return 4;
  return 1;
};

/** Filters a template's groupings to the standard set used by completion validation, returning undefined when none qualify. */
const getWorkflowValidationGroupings = (template?: WorkflowMetadata): StandardGrouping[] | undefined => {
  const standardGroupings = (template?.groupings ?? []).filter(
    (grouping): grouping is StandardGrouping =>
      grouping === 'day1' || grouping === 'day2' || grouping === 'day3' || grouping === 'day4-8',
  );
  return standardGroupings.length > 0 ? standardGroupings : undefined;
};

/** Resolves the workflow ID from template or cycle metadata, falling back to 'default'. */
const resolveWorkflowId = (
  template?: WorkflowMetadata,
  cycleMetadata?: CycleMetadata,
): string => template?.id || cycleMetadata?.workflowId || 'default';

/** Creates initial CycleMetadata for a new cycle. */
const createInitialCycleMetadata = (
  workflowId: string,
  cycleDate: string,
  now: string,
): CycleMetadata => ({
  id: `WF-${workflowId}-${cycleDate}`,
  workflowId,
  cycleDate,
  status: 'in-progress',
  outlookVersions: [{
    version: 1,
    status: 'in-progress',
    createdAt: now,
  }],
  createdAt: now,
  updatedAt: now,
});
const COPY_FEATURE_RULES: Record<DayBucket, Record<DayBucket, CopyFeatureRule[]>> = {
  day12: {
    day12: DIRECT_DAY12_COPY_TYPES.map((type) => ({ sourceType: type, targetType: type })),
    day3: [{ sourceType: 'categorical', targetType: 'categorical' }],
    day48: [],
  },
  day3: {
    day12: [{ sourceType: 'categorical', targetType: 'categorical' }],
    day3: [
      { sourceType: 'totalSevere', targetType: 'totalSevere' },
      { sourceType: 'categorical', targetType: 'categorical' },
    ],
    day48: [],
  },
  day48: {
    day12: [],
    day3: [{ sourceType: 'day4-8', targetType: 'totalSevere' }],
    day48: [{ sourceType: 'day4-8', targetType: 'day4-8' }],
  },
};

/** Collapses the eight forecast days into the three compatibility groups used for copying. */
const getDayBucket = (day: DayType): DayBucket => {
  if (day === 1 || day === 2) {
    return 'day12';
  }
  if (day === 3) {
    return 'day3';
  }
  return 'day48';
};

/** Clears every supported outlook map on a target day before incoming copy operations. */
const clearOutlookMaps = (data: OutlookData) => {
  ALL_OUTLOOK_TYPES.forEach((type) => {
    data[type]?.clear();
  });
};

/** Creates an empty forecast day with the outlook maps supported for that day number. */
const createEmptyOutlook = (day: DayType): OutlookDay => {
  const baseData: OutlookData = {};

  if (day === 1 || day === 2) {
    // Day 1/2: tornado, wind, hail, categorical
    baseData.tornado = new Map();
    baseData.wind = new Map();
    baseData.hail = new Map();
    baseData.categorical = new Map();
  } else if (day === 3) {
    // Day 3: totalSevere, categorical
    baseData.totalSevere = new Map();
    baseData.categorical = new Map();
  } else {
    // Day 4-8: only day4-8 outlook type
    baseData['day4-8'] = new Map();
  }

  return {
    day,
    data: baseData,
    metadata: {
      issueDate: new Date().toISOString(),
      validDate: new Date().toISOString(),
      issuanceTime: '0600',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      lowProbabilityOutlooks: []
    }
  };
};

const initialState: ForecastState = {
  forecastCycle: {
    days: {
      1: createEmptyOutlook(1)
    },
    currentDay: 1,
    cycleDate: getLocalCalendarDate()
  },
  drawingState: {
    // Start with tornado for Day 1/2 (default day)
    activeOutlookType: 'tornado',
    activeProbability: '2%',
    isSignificant: false
  },
  customEditor: {
    mode: 'severe',
    activeLayerId: null,
    activeCategoryId: null,
  },
  currentMapView: {
    center: [39.8283, -98.5795],
    zoom: 4
  },
  isSaved: true,
  emergencyMode: false,
  savedCycles: [],
  historyByDay: {},
  discussionDraftsByScope: {},
  completionValidation: {
    lastResult: null,
    showCompletionModal: false,
    omittedDays: {},
  },
  isWorkflowActive: readStoredWorkflowActive(),
  outlookVersionSnapshots: [],
};

// Helpers to keep reducers small and testable
const computeOutlookType = (feature: Feature, state: ForecastState): OutlookType => {
  return (feature.properties?.outlookType as OutlookType) || state.drawingState.activeOutlookType;
};

/** Normalizes a feature's probability into the store format for its outlook type. */
const computeProbability = (feature: Feature, state: ForecastState): string => {
  const fallback = state.drawingState.activeProbability;
  const base = (feature.properties?.probability ?? fallback) as string;
  const outlookType = (feature.properties?.outlookType as OutlookType) || state.drawingState.activeOutlookType;

  // If the outlook type is categorical, return categorical labels unchanged
  if (outlookType === 'categorical') {
    return base;
  }

  // If hatching or CIG level, return CIG label unchanged
  if (String(base).startsWith('CIG')) {
    return base;
  }

  const normalized = String(base).replace(/[%#]/g, '');
  return `${normalized}%`;
};

/** Ensures new features carry the active outlook metadata required by the editor. */
const buildFeatureWithProps = (
  feature: Feature,
  outlookType: OutlookType,
  probability: string,
  isSignificant: boolean
): Feature => {
  return {
    ...feature,
    properties: {
      ...feature.properties,
      outlookType,
      probability,
      isSignificant,
      derivedFrom: feature.properties?.derivedFrom || outlookType,
      originalProbability: feature.properties?.originalProbability || probability
    }
  } as Feature;
};

// Helper to get current outlook data safely
const getCurrentOutlook = (state: ForecastState): OutlookData => {
  const day = state.forecastCycle.days[state.forecastCycle.currentDay];
  if (!day) {
    // Should not happen if logic is correct, but safe fallback
    return createEmptyOutlook(state.forecastCycle.currentDay).data;
  }
  return day.data;
};

/** Recursively clones plain JSON-like values used inside GeoJSON features. */
const cloneJsonValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)])
    ) as T;
  }

  return value;
};

/** Clones one GeoJSON feature without JSON serialization so history snapshots are cheaper. */
const cloneFeature = (feature: Feature): Feature => cloneJsonValue(feature);

/** Returns the history stacks for one day, creating empty stacks when needed. */
const getOrCreateDayHistory = (
  state: ForecastState,
  day: DayType = state.forecastCycle.currentDay
): ForecastHistoryStacks => {
  if (!state.historyByDay[day]) {
    state.historyByDay[day] = {
      undoStack: [],
      redoStack: []
    };
  }

  return state.historyByDay[day] as ForecastHistoryStacks;
};

/** Deep-clones one probability map so undo/redo snapshots do not share mutable arrays. */
const cloneEntries = (map?: Map<string, Feature[]>): Map<string, Feature[]> | undefined => {
  if (!map) return undefined;
  return new Map(Array.from(map.entries(), ([probability, features]) => [
    probability,
    features.map(cloneFeature),
  ]));
};

/** Copies only the outlook types allowed by the source/target day compatibility rules. */
const copyCompatibleOutlooks = (
  sourceData: OutlookData,
  targetData: OutlookData,
  sourceDay: DayType,
  targetDay: DayType
) => {
  const copyRules = COPY_FEATURE_RULES[getDayBucket(sourceDay)][getDayBucket(targetDay)];

  copyRules.forEach(({ sourceType, targetType }) => {
    const clonedMap = cloneEntries(sourceData[sourceType]);
    if (clonedMap) {
      targetData[targetType] = clonedMap;
    }
  });
};

/** Deep-clones all outlook maps for a day so history snapshots remain isolated from live edits. */
const cloneOutlookData = (data: OutlookData): OutlookData => {
  return {
    tornado: cloneEntries(data.tornado),
    wind: cloneEntries(data.wind),
    hail: cloneEntries(data.hail),
    totalSevere: cloneEntries(data.totalSevere),
    categorical: cloneEntries(data.categorical),
    'day4-8': cloneEntries(data['day4-8']),
  };
};

const cloneCustomLayers = (customLayers?: CustomLayerCollection): CustomLayerCollection | undefined =>
  customLayers ? cloneJsonValue(customLayers) : undefined;

/** Lifecycle transitions preserve stored custom content even while its editor is hidden. */
const cloneIntegratedCustomLayers = (customLayers?: CustomLayerCollection): CustomLayerCollection | undefined =>
  cloneCustomLayers(customLayers);

/** Captures the current day's drawable outlook data and low-probability metadata for history. */
const getCurrentDaySnapshot = (state: ForecastState): ForecastDaySnapshot | null => {
  const currentDay = state.forecastCycle.currentDay;
  const dayData = state.forecastCycle.days[currentDay];
  if (!dayData) return null;

  return {
    day: currentDay,
    data: cloneOutlookData(dayData.data),
    lowProbabilityOutlooks: [...(dayData.metadata.lowProbabilityOutlooks || [])],
    customLayers: cloneCustomLayers(dayData.customLayers),
  };
};

/** Applies a stored day snapshot back into Redux state during undo/redo restoration. */
const applyDaySnapshot = (state: ForecastState, snapshot: ForecastDaySnapshot) => {
  const dayData = state.forecastCycle.days[snapshot.day];
  if (!dayData) {
    state.forecastCycle.days[snapshot.day] = createEmptyOutlook(snapshot.day);
  }

  const targetDay = state.forecastCycle.days[snapshot.day];
  if (!targetDay) return;

  targetDay.data = cloneOutlookData(snapshot.data);
  targetDay.customLayers = cloneCustomLayers(snapshot.customLayers);
  targetDay.metadata.lowProbabilityOutlooks = [...snapshot.lowProbabilityOutlooks];
  targetDay.metadata.lastModified = new Date().toISOString();
};

/** Moves the current day snapshot onto the provided history stack before a reversible edit. */
const pushHistoryEntry = (
  stack: ForecastHistoryEntry[],
  snapshot: ForecastDaySnapshot
) => {
  stack.push({
    day: snapshot.day,
    snapshot,
  });
  if (stack.length > HISTORY_LIMIT) {
    stack.shift();
  }
};

/** Saves the current day into the undo stack and clears redo after a new user edit. */
const pushUndoSnapshot = (state: ForecastState) => {
  const snapshot = getCurrentDaySnapshot(state);
  if (!snapshot) return;

  const dayHistory = getOrCreateDayHistory(state, snapshot.day);
  pushHistoryEntry(dayHistory.undoStack, snapshot);
  dayHistory.redoStack = [];
};

/** Clears all per-day history stacks when the editing context changes to a new document. */
const clearHistory = (state: ForecastState) => {
  state.historyByDay = {};
};

/** Clears stale package completion when forecast package content changes. */
const invalidateCompletionAcknowledgement = (state: ForecastState) => {
  if (state.forecastCycle.completionAcknowledgedAt || state.forecastCycle.omittedDayReasons) {
    delete state.forecastCycle.completionAcknowledgedAt;
    delete state.forecastCycle.omittedDayReasons;
  }
  state.completionValidation.lastResult = null;
};

interface ApplyRolloverArgs {
  sourceCycle: ForecastState['savedCycles'][number];
  sourceDayData: NonNullable<ReturnType<typeof normalizeForecastCycle>['days'][DayType]>;
  sourceDayNumber: DayType;
  targetDay: DayType;
  targetDate: string;
  workflowTemplate?: WorkflowMetadata;
}

/** Builds the fresh rollover cycle and copies the requested day into it. */
const buildRolloverCycle = ({
  sourceDayData,
  sourceDayNumber,
  targetDay,
  targetDate,
}: Omit<ApplyRolloverArgs, 'sourceCycle' | 'workflowTemplate'>): ForecastCycle => {
  const newCycle: ForecastCycle = {
    days: { [targetDay]: createEmptyOutlook(targetDay) },
    currentDay: targetDay,
    cycleDate: targetDate,
  };
  const targetDayData = newCycle.days[targetDay];
  if (targetDayData) {
    copyCompatibleOutlooks(sourceDayData.data, targetDayData.data, sourceDayNumber, targetDay);
    targetDayData.customLayers = cloneIntegratedCustomLayers(sourceDayData.customLayers);
  }
  return newCycle;
};

/**
 * Attaches workflow metadata to the rollover only when a template was passed
 * or the source cycle was already a workflow cycle. Plain rollovers stay plain.
 */
const applyRolloverWorkflowState = (
  state: ForecastState,
  { sourceCycle, targetDate, workflowTemplate }: Pick<ApplyRolloverArgs, 'sourceCycle' | 'targetDate' | 'workflowTemplate'>,
  now: string
) => {
  const sourceHadWorkflow = Boolean(sourceCycle.workflowMetadata);
  if (workflowTemplate || sourceHadWorkflow) {
    const workflowId = resolveWorkflowId(workflowTemplate, sourceCycle.workflowMetadata);
    state.workflowMetadata = createInitialCycleMetadata(workflowId, targetDate, now);
    state.isWorkflowActive = true;
    writeStoredWorkflowActive(true);
    state.workflowTemplate = workflowTemplate || getWorkflowTemplateById(workflowId) || undefined;
    return;
  }
  state.workflowMetadata = undefined;
  state.isWorkflowActive = false;
  writeStoredWorkflowActive(false);
  state.workflowTemplate = undefined;
};

/** Resets the in-memory cycle to a fresh rollover derived from the requested source. */
const applyRolloverFromPreviousCycle = (state: ForecastState, args: ApplyRolloverArgs) => {
  clearHistory(state);
  state.discussionDraftsByScope = {};
  state.forecastCycle = buildRolloverCycle(args);
  state.isSaved = false;
  state.outlookVersionSnapshots = [];
  applyRolloverWorkflowState(state, args, new Date().toISOString());
};

/** Ensures low-probability metadata exists before mutating it in reducers. */
const ensureLowProbabilityOutlooks = (dayData: OutlookDay): OutlookType[] => {
  if (!dayData.metadata.lowProbabilityOutlooks) {
    dayData.metadata.lowProbabilityOutlooks = [];
  }

  return dayData.metadata.lowProbabilityOutlooks;
};

/** Returns whether a low-probability toggle would actually change the current day state. */
const canSetLowProbabilityState = (
  state: ForecastState,
  outlookType: OutlookType,
  isLow: boolean
) => {
  const dayData = state.forecastCycle.days[state.forecastCycle.currentDay];
  if (!dayData) return false;

  const lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks || [];
  const isCurrentlyLow = lowProbabilityOutlooks.includes(outlookType);

  return (isLow && !isCurrentlyLow) || (!isLow && isCurrentlyLow);
};

/** Applies a low-probability toggle for one outlook type and clears its features when enabled. */
const applyLowProbabilityState = (
  state: ForecastState,
  outlookType: OutlookType,
  isLow: boolean
) => {
  const dayData = state.forecastCycle.days[state.forecastCycle.currentDay];
  if (!dayData) return;

  const lowProbabilityOutlooks = ensureLowProbabilityOutlooks(dayData);
  const isCurrentlyLow = lowProbabilityOutlooks.includes(outlookType);

  if (isLow && !isCurrentlyLow) {
    lowProbabilityOutlooks.push(outlookType);
    dayData.data[outlookType]?.clear();
  } else if (!isLow && isCurrentlyLow) {
    dayData.metadata.lowProbabilityOutlooks = lowProbabilityOutlooks.filter((type) => type !== outlookType);
  }

  invalidateCompletionAcknowledgement(state);
  state.isSaved = false;
};

/** Moves one history snapshot to the opposite stack and restores it for undo/redo reducers. */
const restoreHistoryEntry = (
  sourceStack: ForecastHistoryEntry[],
  targetStack: ForecastHistoryEntry[],
  state: ForecastState
) => {
  const nextEntry = sourceStack.pop();
  if (!nextEntry) return;

  const currentSnapshot = getCurrentDaySnapshot(state);
  if (currentSnapshot) {
    pushHistoryEntry(targetStack, currentSnapshot);
  }

  applyDaySnapshot(state, nextEntry.snapshot);
  state.forecastCycle.currentDay = nextEntry.day;
  state.isSaved = false;
};

export const forecastSlice = createSlice({
  name: 'forecast',
  initialState,
  reducers: {
    // Set active day
    setForecastDay: (state, action: PayloadAction<DayType>) => {
      const newDay = action.payload;
      if (!state.forecastCycle.days[newDay]) {
        state.forecastCycle.days[newDay] = createEmptyOutlook(newDay);
      }
      state.forecastCycle.currentDay = newDay;
      state.isSaved = false;
    },

    // Update cycle date
    setCycleDate: (state, action: PayloadAction<string>) => {
      state.forecastCycle.cycleDate = action.payload;
      state.isSaved = false;
    },

    // Set the active outlook type for drawing
    setActiveOutlookType: (state, action: PayloadAction<OutlookType>) => {
        state.drawingState.activeOutlookType = action.payload;

        // Set default probability based on outlook type
        if (action.payload === 'tornado') {
          state.drawingState.activeProbability = '2%';
        } else if (action.payload === 'wind' || action.payload === 'hail') {
          state.drawingState.activeProbability = '5%';
        } else if (action.payload === 'totalSevere') {
          state.drawingState.activeProbability = '5%';
        } else if (action.payload === 'day4-8') {
          state.drawingState.activeProbability = '15%';
        } else if (action.payload === 'categorical') {
          state.drawingState.activeProbability = 'MRGL';
        }

        state.isSaved = false;
      },

      setEmergencyMode: (state, action: PayloadAction<boolean>) => {
        state.emergencyMode = action.payload;
    },

    setActiveProbability: (state, action: PayloadAction<Probability>) => {
      state.drawingState.activeProbability = action.payload;
      if (typeof action.payload === 'string') {
        state.drawingState.isSignificant = action.payload.includes('#');
      }
      state.isSaved = false;
    },

    toggleSignificant: (state) => {
      state.drawingState.isSignificant = false;
    },

    ...createCustomLayerReducers(pushUndoSnapshot),
    ...createCustomCategoryReducers(pushUndoSnapshot),
    ...createCustomFeatureReducers(pushUndoSnapshot),

    addFeature: (state, action: PayloadAction<{ feature: Feature }>) => {
      const feature = action.payload.feature;
      const outlookType = computeOutlookType(feature, state);
      const dayData = state.forecastCycle.days[state.forecastCycle.currentDay];
      if (!dayData) return;

      const outlookData = dayData.data;
      const outlookMap = outlookData[outlookType];
      if (!outlookMap) {
        return;
      }

      const probability = computeProbability(feature, state);
      pushUndoSnapshot(state);

      // If we're adding a feature, this outlook is no longer "Low Probability"
      if (dayData.metadata.lowProbabilityOutlooks) {
        dayData.metadata.lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks.filter(
          t => t !== outlookType
        );
      }

      const existingFeatures = outlookMap.get(probability) || [];

      const featureWithProps = buildFeatureWithProps(
        feature,
        outlookType,
        probability,
        state.drawingState.isSignificant
      );

      outlookMap.set(probability, [...existingFeatures, featureWithProps]);
      invalidateCompletionAcknowledgement(state);
      state.isSaved = false;
    },

    updateFeature: (state, action: PayloadAction<{ feature: Feature }>) => {
      const feature = action.payload.feature;
      const outlookType = (feature.properties?.outlookType as OutlookType) || state.drawingState.activeOutlookType;
      const probability = (feature.properties?.probability as string) || state.drawingState.activeProbability;

      const outlookData = getCurrentOutlook(state);
      const outlookMap = outlookData[outlookType];

      if (!outlookMap) {
        return;
      }

      const features = outlookMap.get(probability);

      if (features) {
        const index = features.findIndex(f => f.id === feature.id);
        if (index !== -1) {
          pushUndoSnapshot(state);
          features[index] = {
            ...features[index],
            geometry: feature.geometry,
            properties: {
              ...features[index].properties,
              ...feature.properties
            }
          };
          invalidateCompletionAcknowledgement(state);
          state.isSaved = false;
        }
      }
    },

    removeFeature: (state, action: PayloadAction<{
      outlookType: OutlookType,
      probability: string,
      featureId: string
    }>) => {
      const { outlookType, probability, featureId } = action.payload;
      const outlookData = getCurrentOutlook(state);
      const outlookMap = outlookData[outlookType];

      if (!outlookMap) {
        return;
      }

      const features = outlookMap.get(probability);

      if (features) {
        const featureIndex = features.findIndex(feature => feature.id === featureId);
        if (featureIndex === -1) {
          return;
        }

        pushUndoSnapshot(state);
        const updatedFeatures = features.filter(feature =>
          feature.id !== featureId
        );

        if (updatedFeatures.length > 0) {
          outlookMap.set(probability, updatedFeatures);
        } else {
          outlookMap.delete(probability);
        }

        invalidateCompletionAcknowledgement(state);
        state.isSaved = false;
      }
    },

    resetCategorical: (state) => {
      const outlooks = getCurrentOutlook(state);
      if (!outlooks.categorical) {
        return; // No categorical map for this day (e.g., Day 4-8)
      }
      const categoricalTypes = Array.from(outlooks.categorical.keys());
      if (categoricalTypes.every((type) => type === 'TSTM')) {
        return;
      }

      const tstmFeatures = outlooks.categorical.get('TSTM') || [];
      pushUndoSnapshot(state);
      outlooks.categorical = new Map();
      if (tstmFeatures.length > 0) {
        outlooks.categorical.set('TSTM', tstmFeatures);
      }
      invalidateCompletionAcknowledgement(state);
      state.isSaved = false;
    },

    setOutlookMap: (state, action: PayloadAction<{
      outlookType: OutlookType,
      map: Map<string, Feature[]>
    }>) => {
      const { outlookType, map } = action.payload;
      const outlookData = getCurrentOutlook(state);

      // Check if outlook type is supported for current day
      if (outlookData[outlookType] !== undefined || outlookType === 'categorical' ||
          outlookType === 'tornado' || outlookType === 'wind' || outlookType === 'hail' ||
          outlookType === 'totalSevere' || outlookType === 'day4-8') {
        if (outlookData[outlookType] === map) {
          return;
        }

        pushUndoSnapshot(state);
        // @ts-ignore - Dynamic property assignment
        outlookData[outlookType] = map;
        invalidateCompletionAcknowledgement(state);
        state.isSaved = false;
      }
    },

    applyAutoCategoricalSync: (state, action: PayloadAction<{ map: Map<string, Feature[]> }>) => {
      const outlookData = getCurrentOutlook(state);
      if (!outlookData.categorical) {
        return;
      }

      outlookData.categorical = action.payload.map;
      invalidateCompletionAcknowledgement(state);
      state.isSaved = false;
    },

    replaceTstmFeatures: (state, action: PayloadAction<{ features: Feature[] }>) => {
      const outlookData = getCurrentOutlook(state);
      if (!outlookData.categorical) {
        return;
      }

      const normalizedFeatures = action.payload.features.map((feature) =>
        buildFeatureWithProps(feature, 'categorical', 'TSTM', false)
      );
      const existingTstm = outlookData.categorical.get('TSTM') || [];

      if (areTstmFeaturesEqual(existingTstm, normalizedFeatures)) {
        return;
      }

      pushUndoSnapshot(state);

      if (normalizedFeatures.length > 0) {
        outlookData.categorical.set('TSTM', normalizedFeatures);
      } else {
        outlookData.categorical.delete('TSTM');
      }

      invalidateCompletionAcknowledgement(state);
      state.isSaved = false;
    },

    setMapView: (state, action: PayloadAction<{ center: [number, number], zoom: number }>) => {
      state.currentMapView = action.payload;
    },

    resetForecasts: (state) => {
      clearHistory(state);
      state.discussionDraftsByScope = {};
      // Clear localStorage first
      try {
        localStorage.removeItem('forecastData');
      } catch {
        // Ignore localStorage clear errors
      }

      // Generate today's local date so rollover prompts and resets stay aligned.
      const today = getLocalCalendarDate();

      // Completely replace forecastCycle to force re-render
      const newCycle: ForecastCycle = {
        days: {
          1: createEmptyOutlook(1)
        },
        currentDay: 1,
        cycleDate: today
      };

      state.forecastCycle = newCycle;
      state.isSaved = false;
      state.outlookVersionSnapshots = [];
      state.workflowMetadata = undefined;
      state.workflowTemplate = undefined;
      state.isWorkflowActive = false;
      writeStoredWorkflowActive(false);
    },

    markAsSaved: (state) => {
      state.isSaved = true;
    },

    // Restores the local auto-save snapshot. Same-session restores may retain unpublished drafts.
    restoreForecastCycle: {
      reducer: (state, action: PayloadAction<{ cycle: ForecastCycle; preserveDiscussionDrafts?: boolean }>) => {
        state.forecastCycle = action.payload.cycle;
        if (!action.payload.preserveDiscussionDrafts) {
          state.discussionDraftsByScope = {};
        }
        clearHistory(state);
        state.isSaved = true;
        state.outlookVersionSnapshots = [];
        state.workflowMetadata = undefined;
        state.workflowTemplate = undefined;
        state.isWorkflowActive = false;
        writeStoredWorkflowActive(false);
      },
      prepare: (cycle: ForecastCycle, preserveDiscussionDrafts = false) => ({
        payload: { cycle, preserveDiscussionDrafts },
      }),
    },

    // Import forecast data: Now handles Cycle
    importForecastCycle: (state, action: PayloadAction<ForecastCycle>) => {
      state.forecastCycle = action.payload;
      state.discussionDraftsByScope = {};
      clearHistory(state);
      state.isSaved = true;
      state.outlookVersionSnapshots = [];
      // Clear workflow state when importing a plain forecast cycle
      state.workflowMetadata = undefined;
      state.workflowTemplate = undefined;
      state.isWorkflowActive = false;
      writeStoredWorkflowActive(false);
    },

    // Legacy import support (Single day) -> Import into CURRENT day
    importForecasts: (state, action: PayloadAction<OutlookData>) => {
      clearHistory(state);
      const currentDay = state.forecastCycle.currentDay;
      const dayData = state.forecastCycle.days[currentDay];
      if (dayData) {
        // Preserve existing TSTM features if categorical exists
        const existingTstm = dayData.data.categorical?.get('TSTM') || [];

        // Replace current day data with imported data
        dayData.data = action.payload;

        // Merge TSTM features if categorical map exists
        if (dayData.data.categorical) {
          const importedTstm = dayData.data.categorical.get('TSTM') || [];
          const mergedTstm = [...existingTstm, ...importedTstm];
          if (mergedTstm.length > 0) {
            dayData.data.categorical.set('TSTM', mergedTstm);
          }
        }

        // Reset low probability flags for types that now have data
        if (dayData.metadata.lowProbabilityOutlooks) {
          const typesWithData = Object.entries(dayData.data)
            .filter(([_, map]) => map && map.size > 0)
            .map(([type]) => type as OutlookType);

          dayData.metadata.lowProbabilityOutlooks = dayData.metadata.lowProbabilityOutlooks.filter(
            t => !typesWithData.includes(t)
          );
        }

        // Update metadata
        dayData.metadata.lastModified = new Date().toISOString();
      }
      state.isSaved = true;
    },

    // Update an unsaved discussion draft without coupling it to the mounted page.
    updateDiscussionDraft: (state, action: PayloadAction<{ scopeId: string; draft: DiscussionData }>) => {
      state.discussionDraftsByScope[action.payload.scopeId] = action.payload.draft;
    },

    /** Moves unpublished drafts when discussion scopes are combined or reset. */
    migrateDiscussionDrafts: (state, action: PayloadAction<{ migrations: Record<string, string>; preferScopeId?: string }>) => {
      const { migrations, preferScopeId } = action.payload;
      const preferredDraft = preferScopeId ? state.discussionDraftsByScope[preferScopeId] : undefined;
      const nextDrafts = { ...state.discussionDraftsByScope };
      const targetsToSources = new Map<string, string[]>();

      Object.entries(migrations).forEach(([fromScopeId, toScopeId]) => {
        const sources = targetsToSources.get(toScopeId) ?? [];
        sources.push(fromScopeId);
        targetsToSources.set(toScopeId, sources);
      });

      targetsToSources.forEach((fromScopeIds, toScopeId) => {
        const sourceDrafts = fromScopeIds
          .map((scopeId) => nextDrafts[scopeId])
          .filter(Boolean) as DiscussionData[];
        const mergedDraft = mergeDiscussionDrafts(sourceDrafts, preferredDraft);
        if (mergedDraft) nextDrafts[toScopeId] = mergedDraft;
      });

      const removedScopeIds = new Set(Object.keys(migrations));
      state.discussionDraftsByScope = Object.fromEntries(
        Object.entries(nextDrafts).filter(([scopeId]) => !removedScopeIds.has(scopeId)),
      ) as Record<string, DiscussionData>;
    },

    // Update discussion for a specific day
    updateDiscussion: (state, action: PayloadAction<{ day: DayType; discussion: DiscussionData; scopeId?: string }>) => {
      const { day, discussion, scopeId } = action.payload;
      const dayData = state.forecastCycle.days[day];
      if (dayData) {
        dayData.discussion = discussion;
        dayData.metadata.lastModified = new Date().toISOString();
        if (scopeId) {
          const { [scopeId]: _removed, ...remainingDrafts } = state.discussionDraftsByScope;
          state.discussionDraftsByScope = remainingDrafts;
        }
        invalidateCompletionAcknowledgement(state);
        state.isSaved = false;
      }
    },

    /** Persists discussion scopes without copying discussion content into each covered day. */
    setDiscussionGroupings: (state, action: PayloadAction<DiscussionGrouping[]>) => {
      if (!isValidDiscussionGroupings(action.payload)) return;
      state.forecastCycle.discussionGroupings = normalizeDiscussionGroupings(action.payload);
      invalidateCompletionAcknowledgement(state);
      state.isSaved = false;
    },

    /** Clears custom discussion scopes and restores workflow or day defaults. */
    resetDiscussionGroupings: (state) => {
      state.forecastCycle.discussionGroupings = undefined;
      invalidateCompletionAcknowledgement(state);
      state.isSaved = false;
    },

    // Cycle History Management
    saveCurrentCycle: (state, action: PayloadAction<{ label?: string }>) => {
      const forecastCycleSnapshot = cloneForecastCycle(state.forecastCycle);
      const savedCycle: SavedCycle = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        cycleDate: state.forecastCycle.cycleDate,
        label: action.payload.label,
        forecastCycle: forecastCycleSnapshot,
        stats: countForecastMetrics(forecastCycleSnapshot),
        workflowMetadata: state.workflowMetadata ? { ...state.workflowMetadata } : undefined,
      };
      state.savedCycles.push(savedCycle);
      state.isSaved = true;
    },

    loadSavedCycle: (state, action: PayloadAction<string>) => {
      const cycleId = action.payload;
      const savedCycle = state.savedCycles.find(c => c.id === cycleId);
      if (savedCycle) {
        state.forecastCycle = cloneForecastCycle(normalizeForecastCycle(savedCycle.forecastCycle));
        clearHistory(state);
      state.discussionDraftsByScope = {};
        state.isSaved = true;
        state.outlookVersionSnapshots = [];
        
        // Restore or clear workflow metadata
        if (savedCycle.workflowMetadata) {
          state.workflowMetadata = savedCycle.workflowMetadata;
          // Restore the workflow template from the workflowId
          state.workflowTemplate = getWorkflowTemplateById(savedCycle.workflowMetadata.workflowId) || {
            id: savedCycle.workflowMetadata.workflowId,
            label: savedCycle.workflowMetadata.workflowId,
            groupings: [],
          };
          state.isWorkflowActive = true;
          writeStoredWorkflowActive(true);
        } else {
          state.workflowMetadata = undefined;
          state.workflowTemplate = undefined;
          state.isWorkflowActive = false;
          writeStoredWorkflowActive(false);
        }
      }
    },

    deleteSavedCycle: (state, action: PayloadAction<string>) => {
      const cycleId = action.payload;
      state.savedCycles = state.savedCycles.filter(c => c.id !== cycleId);
    },

    // Copy features from one cycle/day to current cycle/day
    copyFeaturesFromPrevious: (state, action: PayloadAction<{
      sourceCycle: ForecastCycle;
      sourceDay: DayType;
      targetDay: DayType;
    }>) => {
      clearHistory(state);
      const { sourceCycle, sourceDay, targetDay } = action.payload;

      const sourceDayData = sourceCycle.days[sourceDay];
      if (!sourceDayData) {
        return;
      }

      // Ensure target day exists
      if (!state.forecastCycle.days[targetDay]) {
        state.forecastCycle.days[targetDay] = createEmptyOutlook(targetDay);
      }

      const targetDayData = state.forecastCycle.days[targetDay];
      if (!targetDayData) {
        return;
      }

      clearOutlookMaps(targetDayData.data);
      copyCompatibleOutlooks(sourceDayData.data, targetDayData.data, sourceDay, targetDay);
      // Custom layers are grouping-agnostic. Copy replaces the target
      // collection with a detached clone, just like severe outlook data.
      targetDayData.customLayers = cloneIntegratedCustomLayers(sourceDayData.customLayers);

      targetDayData.metadata.lastModified = new Date().toISOString();
      clearHistory(state);
      state.isSaved = false;
    },

    // Load cycles from storage (for hydration)
    loadCycleHistory: (state, action: PayloadAction<SavedCycle[]>) => {
      state.savedCycles = action.payload;
    },

    setLowProbability: (state, action: PayloadAction<{ outlookType: OutlookType, isLow: boolean }>) => {
      const { outlookType, isLow } = action.payload;
      if (canSetLowProbabilityState(state, outlookType, isLow)) {
        pushUndoSnapshot(state);
        applyLowProbabilityState(state, outlookType, isLow);
      }
    },

    toggleLowProbability: (state) => {
      const outlookType = state.drawingState.activeOutlookType;
      const dayData = state.forecastCycle.days[state.forecastCycle.currentDay];
      const isCurrentlyLow = dayData?.metadata.lowProbabilityOutlooks?.includes(outlookType) || false;
      if (canSetLowProbabilityState(state, outlookType, !isCurrentlyLow)) {
        pushUndoSnapshot(state);
        applyLowProbabilityState(state, outlookType, !isCurrentlyLow);
      }
    },

    undoLastEdit: (state) => {
      const dayHistory = getOrCreateDayHistory(state);
      restoreHistoryEntry(dayHistory.undoStack, dayHistory.redoStack, state);
    },

    redoLastEdit: (state) => {
      const dayHistory = getOrCreateDayHistory(state);
      restoreHistoryEntry(dayHistory.redoStack, dayHistory.undoStack, state);
    },

    // v2 workflow metadata reducers
    setWorkflowMetadata: (state, action: PayloadAction<CycleMetadata>) => {
      state.workflowMetadata = action.payload;
      state.workflowTemplate = getWorkflowTemplateById(action.payload.workflowId) || state.workflowTemplate;
      state.isWorkflowActive = true;
      writeStoredWorkflowActive(true);
    },

    clearWorkflowMetadata: (state) => {
      state.workflowMetadata = undefined;
      state.workflowTemplate = undefined;
      state.isWorkflowActive = false;
      writeStoredWorkflowActive(false);
    },

    setWorkflowTemplate: (state, action: PayloadAction<WorkflowMetadata>) => {
      state.workflowTemplate = action.payload;
    },

    importWorkflowPackage: (state, action: PayloadAction<Package>) => {
      const pkg = action.payload;
      // Import the first cycle's metadata (packages typically have one cycle)
      if (pkg.cycles.length > 0) {
        state.workflowMetadata = pkg.cycles[0];
        state.isWorkflowActive = true;
        writeStoredWorkflowActive(true);
      }
      if (pkg.metadata) {
        state.workflowTemplate = getWorkflowTemplateById(pkg.metadata.workflowId) || {
          id: pkg.metadata.workflowId,
          label: pkg.metadata.workflowId,
          groupings: [],
        };
      }
      state.discussionDraftsByScope = {};
      clearHistory(state);
      state.isSaved = true;
      state.outlookVersionSnapshots = [];
    },

    // Completion validation (WF-03)
    validateCompletion: (state) => {
      const result = validateCycleCompletion(
        state.forecastCycle,
        getWorkflowValidationGroupings(state.workflowTemplate),
      );
      state.completionValidation.lastResult = result;
      state.completionValidation.omittedDays = {};
      state.completionValidation.showCompletionModal = true;
    },

    dismissCompletionModal: (state) => {
      state.completionValidation.showCompletionModal = false;
    },

    omitDay: (state, action: PayloadAction<{ day: DayType; reason: string }>) => {
      const { day, reason } = action.payload;
      state.completionValidation.omittedDays[day] = reason;
    },

    completeCycle: (state) => {
      const completedAt = new Date().toISOString();
      state.forecastCycle.completionAcknowledgedAt = completedAt;
      if (state.workflowMetadata) {
        state.workflowMetadata.status = 'completed';
        state.workflowMetadata.updatedAt = completedAt;
        const currentVersion = state.workflowMetadata.outlookVersions[state.workflowMetadata.outlookVersions.length - 1];
        if (currentVersion?.status === 'in-progress') currentVersion.status = 'completed';
      }
      delete state.forecastCycle.omittedDayReasons;
      delete state.forecastCycle.updateInProgressVersion;
      state.completionValidation.showCompletionModal = false;
      state.completionValidation.lastResult = null;
      state.completionValidation.omittedDays = {};
      state.isSaved = false;
    },

    completeWithOmissions: (state) => {
      const completedAt = new Date().toISOString();
      state.forecastCycle.completionAcknowledgedAt = completedAt;
      if (state.workflowMetadata) {
        state.workflowMetadata.status = 'completed-with-omissions';
        state.workflowMetadata.updatedAt = completedAt;
        const currentVersion = state.workflowMetadata.outlookVersions[state.workflowMetadata.outlookVersions.length - 1];
        if (currentVersion?.status === 'in-progress') currentVersion.status = 'omitted';
      }
      state.forecastCycle.omittedDayReasons = { ...state.completionValidation.omittedDays };
      delete state.forecastCycle.updateInProgressVersion;
      state.completionValidation.showCompletionModal = false;
      state.completionValidation.lastResult = null;
      state.completionValidation.omittedDays = {};
      state.isSaved = false;
    },

    clearOmittedDays: (state) => {
      state.completionValidation.omittedDays = {};
    },

    // WF-04: Workflow entry, resume, update, and base-cycle actions

    /** Start a new blank cycle with optional workflow metadata. */
    startBlankCycle: (state, action: PayloadAction<{
      workflowTemplate?: WorkflowMetadata;
      cycleDate?: string;
    }>) => {
      const { workflowTemplate, cycleDate } = action.payload;
      clearHistory(state);
      state.discussionDraftsByScope = {};
      try {
        localStorage.removeItem('forecastData');
      } catch {
        // Ignore localStorage errors
      }
      const today = cycleDate || getLocalCalendarDate();
      const startDay = getWorkflowStartDay(workflowTemplate);
      const newCycle: ForecastCycle = {
        days: { [startDay]: createEmptyOutlook(startDay) },
        currentDay: startDay,
        cycleDate: today
      };
      state.forecastCycle = newCycle;
      state.isSaved = false;
      state.outlookVersionSnapshots = [];
      
      if (workflowTemplate) {
        state.workflowTemplate = workflowTemplate;
        // Create initial cycle metadata
        const now = new Date().toISOString();
        state.workflowMetadata = {
          id: `WF-${workflowTemplate.id}-${today}`,
          workflowId: workflowTemplate.id,
          cycleDate: today,
          status: 'in-progress',
          outlookVersions: [{
            version: 1,
            status: 'in-progress',
            createdAt: now,
          }],
          createdAt: now,
          updatedAt: now,
        };
        state.isWorkflowActive = true;
        writeStoredWorkflowActive(true);
      } else {
        // Clear stale workflow state when starting without a template
        state.workflowTemplate = undefined;
        state.workflowMetadata = undefined;
        state.isWorkflowActive = false;
        writeStoredWorkflowActive(false);
      }
    },

    /** Resume an incomplete cycle from a saved snapshot, restoring workflow metadata. */
    resumeIncompleteCycle: (state, action: PayloadAction<{ cycleId: string }>) => {
      const { cycleId } = action.payload;
      const savedCycle = state.savedCycles.find((c) => c.id === cycleId);
      if (!savedCycle) return;

      clearHistory(state);
      state.discussionDraftsByScope = {};
      state.forecastCycle = cloneForecastCycle(normalizeForecastCycle(savedCycle.forecastCycle));
      state.isSaved = true;
      state.outlookVersionSnapshots = [];
      
      // Restore or clear workflow metadata
      if (savedCycle.workflowMetadata) {
        state.workflowMetadata = savedCycle.workflowMetadata;
        // Restore the workflow template from the workflowId
        state.workflowTemplate = getWorkflowTemplateById(savedCycle.workflowMetadata.workflowId) || {
          id: savedCycle.workflowMetadata.workflowId,
          label: savedCycle.workflowMetadata.workflowId,
          groupings: [],
        };
        state.isWorkflowActive = true;
        writeStoredWorkflowActive(true);
      } else {
        state.workflowMetadata = undefined;
        state.workflowTemplate = undefined;
        state.isWorkflowActive = false;
        writeStoredWorkflowActive(false);
      }
    },

    /** Create a new outlook version within the current cycle (same-cycle update). */
    createOutlookUpdate: (state) => {
      const now = new Date().toISOString();

      // Determine the next version number
      const currentVersions = state.workflowMetadata?.outlookVersions || [];
      const nextVersion = currentVersions.length > 0
        ? Math.max(...currentVersions.map(v => v.version)) + 1
        : 1;

      // Snapshot every day that has data so full-outlook workflows keep
      // the whole version side-by-side with the next iteration, not just
      // the currently selected day.
      const snapshotDays: typeof state.forecastCycle.days = {};
      let hasSnapshot = false;
      (Object.entries(state.forecastCycle.days) as unknown as [DayType, typeof state.forecastCycle.days[DayType]][]).forEach(
        ([day, dayData]) => {
          if (!dayData) return;
          snapshotDays[day] = {
            ...dayData,
            data: cloneOutlookData(dayData.data),
            // Version history must retain the exact geometry and appearance
            // that existed before the update, not a live reference.
            customLayers: cloneIntegratedCustomLayers(dayData.customLayers),
          };
          hasSnapshot = true;
        },
      );

      if (hasSnapshot) {
        state.outlookVersionSnapshots.push({
          version: nextVersion - 1, // Snapshot the previous version
          days: snapshotDays,
          createdAt: now,
        });
      }
      
      // Mark previous versions as completed
      if (state.workflowMetadata) {
        state.workflowMetadata.outlookVersions.forEach(v => {
          if (v.status === 'in-progress') {
            v.status = 'completed';
          }
        });
        
        // Add new version
        state.workflowMetadata.outlookVersions.push({
          version: nextVersion,
          status: 'in-progress',
          derivedFrom: nextVersion - 1,
          createdAt: now,
        });
        
        state.workflowMetadata.status = 'in-progress';
        state.workflowMetadata.updatedAt = now;
      }
      
      state.forecastCycle.updateInProgressVersion = nextVersion;
      invalidateCompletionAcknowledgement(state);
      state.isSaved = false;
    },

    /** Start a new cycle derived from a previous cycle. */
    startFromPreviousCycle: (state, action: PayloadAction<{
      sourceCycleId: string;
      newCycleDate?: string;
      sourceDay?: DayType;
      targetDay?: DayType;
      workflowTemplate?: WorkflowMetadata;
    }>) => {
      const { sourceCycleId, newCycleDate, sourceDay, targetDay = 1, workflowTemplate } = action.payload;

      const sourceCycle = state.savedCycles.find(c => c.id === sourceCycleId);
      if (!sourceCycle) return;

      const sourceForecastCycle = normalizeForecastCycle(sourceCycle.forecastCycle);
      const sourceDayNumber = sourceDay ?? sourceForecastCycle.currentDay;
      const sourceDayData = sourceForecastCycle.days[sourceDayNumber];
      if (!sourceDayData) return;

      applyRolloverFromPreviousCycle(state, {
        sourceCycle,
        sourceDayData,
        sourceDayNumber,
        targetDay,
        targetDate: newCycleDate || getLocalCalendarDate(),
        workflowTemplate,
      });
    },
  }
});

export const {
  setActiveOutlookType,
  setActiveProbability,
  toggleSignificant,
  setCustomEditorMode,
  selectCustomLayer,
  selectCustomCategory,
  addCustomLayer,
  updateCustomLayerLabel,
  removeCustomLayer,
  moveCustomLayer,
  addCustomCategory,
  updateCustomCategory,
  removeCustomCategory,
  moveCustomCategory,
  addCustomFeature,
  updateCustomFeature,
  removeCustomFeature,
  addFeature,
  updateFeature,
  removeFeature,
  resetCategorical,
  setOutlookMap,
  applyAutoCategoricalSync,
  replaceTstmFeatures,
  setMapView,
  resetForecasts,
  markAsSaved,
  importForecasts,
  restoreForecastCycle,
  importForecastCycle,
  setForecastDay,
  setCycleDate,
  setEmergencyMode,
  updateDiscussionDraft,
  migrateDiscussionDrafts,
  updateDiscussion,
  setDiscussionGroupings,
  resetDiscussionGroupings,
  saveCurrentCycle,
  loadSavedCycle,
  deleteSavedCycle,
  copyFeaturesFromPrevious,
  loadCycleHistory,
  setLowProbability,
  toggleLowProbability,
  undoLastEdit,
  redoLastEdit,
  setWorkflowMetadata,
  clearWorkflowMetadata,
  setWorkflowTemplate,
  importWorkflowPackage,
  validateCompletion,
  dismissCompletionModal,
  omitDay,
  completeCycle,
  completeWithOmissions,
  clearOmittedDays,
  startBlankCycle,
  resumeIncompleteCycle,
  createOutlookUpdate,
  startFromPreviousCycle,
} = forecastSlice.actions;

/** Selects the full forecast slice. */
export const selectForecast = (state: RootState) => state.forecast;
/** Selects the active forecast cycle document. */
export const selectForecastCycle = (state: RootState) => state.forecast.forecastCycle;
/** Selects the currently active forecast day number. */
export const selectCurrentDay = (state: RootState) => state.forecast.forecastCycle.currentDay;
/** Selects one day's unsaved discussion draft, if the editor has changed it. */
export const selectDiscussionDraftForScope = (state: RootState, scopeId: string) => state.forecast.discussionDraftsByScope[scopeId];
/** Selects the outlook maps for the active day, falling back to an empty day shape when needed. */
export const selectCurrentOutlooks = (state: RootState) => {
  const cycle = state.forecast.forecastCycle;
  return cycle.days[cycle.currentDay]?.data || createEmptyOutlook(cycle.currentDay).data;
};
const EMPTY_CUSTOM_LAYERS: CustomLayerCollection = {
  schemaVersion: '1.0.0',
  layers: [],
};
export const selectCurrentCustomLayers = (state: RootState): CustomLayerCollection => {
  const cycle = state.forecast.forecastCycle;
  return cycle?.days?.[cycle.currentDay]?.customLayers || EMPTY_CUSTOM_LAYERS;
};
/** Selects the outlook maps for a specific day, falling back to an empty day shape when absent. */
export const selectOutlooksForDay = (state: RootState, day: DayType) => {
  const cycle = state.forecast.forecastCycle;
  return cycle.days[day]?.data || createEmptyOutlook(day).data;
};
/** Selects the saved forecast cycle snapshots shown in cycle history. */
export const selectSavedCycles = (state: RootState) => state.forecast.savedCycles;
/** Returns whether there is at least one reversible edit available. */
export const selectCanUndo = (state: RootState) => {
  const dayHistory = state.forecast.historyByDay[state.forecast.forecastCycle.currentDay];
  return (dayHistory?.undoStack?.length ?? 0) > 0;
};
/** Returns whether there is at least one redo entry available. */
export const selectCanRedo = (state: RootState) => {
  const dayHistory = state.forecast.historyByDay[state.forecast.forecastCycle.currentDay];
  return (dayHistory?.redoStack?.length ?? 0) > 0;
};

/** Returns whether the active outlook type is currently marked as low probability. */
export const selectIsLowProbability = (state: RootState) => {
  const cycle = state.forecast.forecastCycle;
  const day = cycle.days[cycle.currentDay];
  const activeType = state.forecast.drawingState.activeOutlookType;
  return day?.metadata?.lowProbabilityOutlooks?.includes(activeType) || false;
};

/** Selects the last completion validation result. */
export const selectCompletionValidationResult = (state: RootState) =>
  state.forecast.completionValidation.lastResult;

/** Selects whether the completion modal is visible. */
export const selectShowCompletionModal = (state: RootState) =>
  state.forecast.completionValidation.showCompletionModal;

/** Selects the omitted days map. */
export const selectOmittedDays = (state: RootState) =>
  state.forecast.completionValidation.omittedDays;

/** Selects the workflow metadata for the active cycle. */
export const selectWorkflowMetadata = (state: RootState) =>
  state.forecast.workflowMetadata;

/** Selects whether a forecast workflow is active across app routes. */
export const selectIsWorkflowActive = (state: RootState) =>
  state.forecast.isWorkflowActive;

/** Selects whether the current route should render workflow-specific UI. */
export const selectHasActiveWorkflow = (state: RootState) =>
  state.forecast.isWorkflowActive && Boolean(state.forecast.workflowMetadata);

/** Selects the workflow template metadata. */
export const selectWorkflowTemplate = (state: RootState) =>
  state.forecast.workflowTemplate;

/** Selects the outlook version snapshots for the active cycle. */
export const selectOutlookVersionSnapshots = (state: RootState) =>
  state.forecast.outlookVersionSnapshots;

/** Selects the current version number for the active cycle. */
export const selectCurrentVersionNumber = (state: RootState) => {
  const metadata = state.forecast.workflowMetadata;
  if (!metadata || metadata.outlookVersions.length === 0) return 1;
  return Math.max(...metadata.outlookVersions.map(v => v.version));
};

export default forecastSlice.reducer;
