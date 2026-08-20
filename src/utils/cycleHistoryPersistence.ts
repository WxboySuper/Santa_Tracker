import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import type { Store } from 'redux';
import type { RootState } from '../store';
import { loadCycleHistory } from '../store/forecastSlice';
import type { LifetimeCycleStats, SavedCycle, SavedCycleStats } from '../store/forecastSlice';
import { deserializeForecast, serializeForecast } from './fileUtils';
import { countForecastMetrics } from './forecastMetrics';
import { normalizeForecastCycle } from './outlookMapCoercion';
import type { ForecastCycle, GFCForecastSaveData, CycleMetadata } from '../types/outlooks';
import { getScopedStorageKey, getStorageScope } from './storageScope';

const CYCLE_HISTORY_KEY = 'gfc-cycle-history';
const LEGACY_CYCLE_HISTORY_KEY = CYCLE_HISTORY_KEY;
const CYCLE_HISTORY_CLAIM_KEY = 'gfc-cycle-history-claim';
const STORAGE_MAP_VIEW = { center: [0, 0] as [number, number], zoom: 0 };

interface PersistedSavedCycle {
  id: string;
  timestamp: string;
  cycleDate: string;
  label?: string;
  forecastData: GFCForecastSaveData;
  stats?: SavedCycleStats;
  /** v2 workflow metadata for the cycle (optional, present for workflow-imported cycles). */
  workflowMetadata?: CycleMetadata;
}

export interface CycleHistorySnapshot {
  cycles: SavedCycle[];
  lifetimeCycleStats: LifetimeCycleStats;
}

/** Converts an in-memory saved cycle into a JSON-safe storage shape that preserves map data. */
const toPersistedSavedCycle = (cycle: SavedCycle): PersistedSavedCycle => ({
  id: cycle.id,
  timestamp: cycle.timestamp,
  cycleDate: cycle.cycleDate,
  label: cycle.label,
  forecastData: serializeForecast(cycle.forecastCycle, STORAGE_MAP_VIEW, cycle.workflowMetadata),
  stats: cycle.stats,
  workflowMetadata: cycle.workflowMetadata,
});

/** Restores one saved cycle from storage, rehydrating its forecast maps and filling stats when missing. */
const fromPersistedSavedCycle = (cycle: PersistedSavedCycle): SavedCycle => {
  const forecastCycle = deserializeForecast(cycle.forecastData);

  return {
    id: cycle.id,
    timestamp: cycle.timestamp,
    cycleDate: cycle.cycleDate,
    label: cycle.label,
    forecastCycle,
    stats: cycle.stats ?? countForecastMetrics(forecastCycle),
    workflowMetadata: cycle.workflowMetadata,
  };
};

/** Best-effort migration path for older saved-cycle entries that stored raw forecastCycle objects. */
const fromLegacySavedCycle = (cycle: {
  id: string;
  timestamp: string;
  cycleDate: string;
  label?: string;
  forecastCycle: ForecastCycle;
  stats?: SavedCycleStats;
}): SavedCycle => {
  const forecastCycle = normalizeForecastCycle(cycle.forecastCycle);

  return {
    id: cycle.id,
    timestamp: cycle.timestamp,
    cycleDate: cycle.cycleDate,
    label: cycle.label,
    forecastCycle,
    stats: cycle.stats ?? countForecastMetrics(forecastCycle),
  };
};

/** Returns the storage key for anonymous or account-scoped cycle history. */
export const getCycleHistoryStorageKey = (userId?: string | null): string =>
  userId ? getScopedStorageKey(CYCLE_HISTORY_KEY, getStorageScope(userId)) : CYCLE_HISTORY_KEY;

/** Parses one stored history value, dropping malformed entries without throwing. */
const parseStoredCycleHistory = (serialized: string | null): SavedCycle[] => {
  if (!serialized) return [];

  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((cycle) => {
        if (!cycle || typeof cycle !== 'object') return null;

        try {
          if ('forecastData' in cycle) return fromPersistedSavedCycle(cycle as PersistedSavedCycle);
          if ('forecastCycle' in cycle) return fromLegacySavedCycle(cycle as SavedCycle);
          return null;
        } catch {
          return null;
        }
      })
      .filter((cycle): cycle is SavedCycle => cycle !== null);
  } catch {
    return [];
  }
};

const emptyCycleHistorySnapshot = (): CycleHistorySnapshot => ({
  cycles: [],
  lifetimeCycleStats: { totalCyclesMade: 0, totalForecastsMade: 0 },
});

const getCycleDayIndex = (cycleDate: string): number => {
  const [year, month, day] = cycleDate.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
};

const deriveForecastStreak = (cycles: SavedCycle[]): Pick<LifetimeCycleStats, 'forecastStreak' | 'lastSavedCycleDate'> => {
  const uniqueDates = Array.from(new Set(cycles.map((cycle) => cycle.cycleDate))).sort();
  if (uniqueDates.length === 0) return {};

  let forecastStreak = 1;
  for (let index = uniqueDates.length - 1; index > 0; index -= 1) {
    if (getCycleDayIndex(uniqueDates[index]) - getCycleDayIndex(uniqueDates[index - 1]) !== 1) break;
    forecastStreak += 1;
  }

  return { forecastStreak, lastSavedCycleDate: uniqueDates[uniqueDates.length - 1] };
};

const deriveLifetimeCycleStats = (cycles: SavedCycle[]): LifetimeCycleStats => ({
  totalCyclesMade: cycles.length,
  totalForecastsMade: cycles.reduce((total, cycle) => total + (cycle.stats.forecastDays ?? 0), 0),
  ...deriveForecastStreak(cycles),
});

const isOptionalNumber = (value: unknown): value is number | undefined =>
  value === undefined || typeof value === 'number';

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === '[object Object]';

const isLifetimeCycleStats = (value: unknown): value is LifetimeCycleStats => {
  if (!isRecord(value)) return false;
  return [
    typeof value.totalCyclesMade === 'number',
    typeof value.totalForecastsMade === 'number',
    isOptionalNumber(value.forecastStreak),
    isOptionalString(value.lastSavedCycleDate),
  ].every(Boolean);
};

const getStoredLifetimeStats = (parsed: unknown) => {
  const stats = (parsed as { lifetimeCycleStats?: unknown } | null)?.lifetimeCycleStats;
  return isLifetimeCycleStats(stats) ? stats : undefined;
};

const readStoredLifetimeStats = (parsed: unknown, cycles: SavedCycle[]) => {
  const derived = deriveLifetimeCycleStats(cycles);
  const stored = getStoredLifetimeStats(parsed);
  return stored
    ? {
        ...derived,
        ...stored,
        forecastStreak: stored.forecastStreak ?? derived.forecastStreak,
        lastSavedCycleDate: stored.lastSavedCycleDate ?? derived.lastSavedCycleDate,
      }
    : derived;
};

const parseStoredCycleHistorySnapshot = (serialized: string | null): CycleHistorySnapshot => {
  if (!serialized) return emptyCycleHistorySnapshot();

  try {
    const parsed = JSON.parse(serialized) as { cycles?: unknown } | unknown[];
    const cycles = Array.isArray(parsed)
      ? parseStoredCycleHistory(serialized)
      : parseStoredCycleHistory(JSON.stringify(parsed.cycles));
    return { cycles, lifetimeCycleStats: readStoredLifetimeStats(parsed, cycles) };
  } catch {
    return emptyCycleHistorySnapshot();
  }
};

/** Returns the account that claimed the legacy cycle-history copy, if any. */
const readLegacyCycleHistoryClaim = (): string | null => localStorage.getItem(CYCLE_HISTORY_CLAIM_KEY);

/** Records which account claimed the legacy cycle-history copy. */
const writeLegacyCycleHistoryClaim = (userId: string): void => {
  localStorage.setItem(CYCLE_HISTORY_CLAIM_KEY, userId);
};

/** Returns true when the signed-in account may import the unscoped legacy history. */
const canImportLegacyCycleHistory = (userId: string): boolean => {
  const claim = readLegacyCycleHistoryClaim();
  return claim === null || claim === userId;
};

/** Copies legacy cycle history into an account scope when it is empty and claimable. */
const importLegacyCycleHistoryToScope = (userId: string, legacyValue: string): void => {
  if (!canImportLegacyCycleHistory(userId)) return;

  const scopedKey = getCycleHistoryStorageKey(userId);
  const scopedValue = localStorage.getItem(scopedKey);
  const scopedCycles = parseStoredCycleHistory(scopedValue);
  if (scopedValue !== null && scopedCycles.length > 0) return;

  localStorage.setItem(scopedKey, legacyValue);
  writeLegacyCycleHistoryClaim(userId);
};

/** Moves usable anonymous cycle history into the signed-in account scope when its current scope is empty or unusable. */
export const migrateLegacyCycleHistory = (userId?: string | null): void => {
  if (!userId) return;

  try {
    const legacyValue = localStorage.getItem(LEGACY_CYCLE_HISTORY_KEY);
    if (legacyValue === null) return;

    importLegacyCycleHistoryToScope(userId, legacyValue);
  } catch {
    // Ignore storage failures so sign-in never disrupts editing.
  }
};

/** Persists saved cycles in the anonymous or account-scoped localStorage key. */
export const saveCycleHistoryToStorage = (
  cycles: SavedCycle[],
  userId?: string | null,
  lifetimeCycleStats?: LifetimeCycleStats,
): void => {
  try {
    const serialized = JSON.stringify({
      cycles: cycles.map(toPersistedSavedCycle),
      lifetimeCycleStats: lifetimeCycleStats ?? {
        totalCyclesMade: cycles.length,
        totalForecastsMade: cycles.reduce((total, cycle) => total + (cycle.stats.forecastDays ?? 0), 0),
      },
    });
    localStorage.setItem(getCycleHistoryStorageKey(userId), serialized);
  } catch {
    // Silently ignore localStorage write failures
  }
};

/**
 * Load cycle history from localStorage
 */
export const loadCycleHistoryFromStorage = (userId?: string | null): SavedCycle[] => {
  return loadCycleHistorySnapshotFromStorage(userId).cycles;
};

export const loadCycleHistorySnapshotFromStorage = (userId?: string | null): CycleHistorySnapshot => {
  try {
    const scopedKey = getCycleHistoryStorageKey(userId);
    const scopedSerialized = localStorage.getItem(scopedKey);
    const scopedSnapshot = parseStoredCycleHistorySnapshot(scopedSerialized);
    if (scopedSnapshot.cycles.length > 0 || !userId) {
      if (!userId && scopedSerialized === null) {
        const legacySerialized = localStorage.getItem(LEGACY_CYCLE_HISTORY_KEY);
        if (legacySerialized) {
          localStorage.setItem(scopedKey, legacySerialized);
          return parseStoredCycleHistorySnapshot(legacySerialized);
        }
      }
      return scopedSnapshot;
    }

    // During rollout, signed-in users may still have only the pre-scope history.
    const legacySerialized = localStorage.getItem(LEGACY_CYCLE_HISTORY_KEY);
    const legacySnapshot = parseStoredCycleHistorySnapshot(legacySerialized);
    if (legacySnapshot.cycles.length > 0 && canImportLegacyCycleHistory(userId)) {
      importLegacyCycleHistoryToScope(userId, legacySerialized as string);
      return legacySnapshot;
    }
    return scopedSnapshot;
  } catch {
    return { cycles: [], lifetimeCycleStats: { totalCyclesMade: 0, totalForecastsMade: 0 } };
  }
};

/**
 * Hook to hydrate cycle history on app startup
 */
export const useCycleHistoryPersistence = (userId?: string | null): void => {
  const dispatch = useDispatch();

  useEffect(() => {
    // Clear the previous account's history before hydrating the new scope.
    dispatch(loadCycleHistory([]));
    migrateLegacyCycleHistory(userId);
    const snapshot = loadCycleHistorySnapshotFromStorage(userId);
    if (snapshot.cycles.length > 0) {
      dispatch(loadCycleHistory(snapshot));
    }
  }, [dispatch, userId]);
};

/**
 * Subscribe to Redux store changes and persist cycle history
 * Call this from the root component after store initialization
 */
export const setupCycleHistoryListener = (store: Store<RootState>, userId?: string | null): (() => void) => {
  let previousCycles: SavedCycle[] = store.getState().forecast.savedCycles;

  return store.subscribe(() => {
    const state = store.getState();
    const currentCycles = state.forecast.savedCycles;

    if (currentCycles !== previousCycles) {
      if (userId) {
        saveCycleHistoryToStorage(currentCycles, userId, state.forecast.lifetimeCycleStats);
      } else {
        saveCycleHistoryToStorage(currentCycles, undefined, state.forecast.lifetimeCycleStats);
      }
      previousCycles = currentCycles;
    }
  });
};
