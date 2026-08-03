import { useEffect, useState, useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import { CloudCycleMetadata, CloudCycleContext, CloudOperationResult, CloudSyncState } from '../types/cloudCycles';
import {
  saveCloudCycle,
  loadCloudCycle,
  deleteCloudCycle,
  renameCloudCycle,
  listCloudCycles,
  subscribeToCloudCycles,
} from '../lib/cloudCyclesService';
import { GFCForecastSaveData } from '../types/outlooks';
import type { CycleMetadata } from '../types/workflow';
import { SavedCycleStats } from '../store/forecastSlice';
import { queueProductMetric } from '../utils/productMetrics';
import { readLocalTestAccount } from '../lib/localTestAccount';
import { trackProductEvent } from '../lib/productAnalytics';

export interface UseCloudCyclesResult {
  cycles: CloudCycleMetadata[];
  currentCloud: CloudCycleContext | null;
  loading: boolean;
  error: string | null;
  saveCycle: (
    label: string,
    cycleDate: string,
    stats: SavedCycleStats,
    payload: GFCForecastSaveData,
    workflowMetadata?: CycleMetadata,
    options?: { saveAsNew?: boolean },
  ) => Promise<boolean>;
  loadCycle: (cycleId: string) => Promise<GFCForecastSaveData | null>;
  deleteCycle: (cycleId: string) => Promise<boolean>;
  renameCycle: (cycleId: string, newLabel: string) => Promise<boolean>;
  markAsCurrent: (cycleId: string, label: string) => void;
  clearCurrent: () => void;
  refreshCycles: () => Promise<void>;
  updateSyncState: (state: CloudSyncState, error?: string) => void;
}

interface CloudAccessContext {
  userId?: string;
  canWrite: boolean;
  localFixtureActive: boolean;
}

interface CloudStateContext {
  cycles: CloudCycleMetadata[];
  currentCloudRef: MutableRefObject<CloudCycleContext | null>;
  setCurrentCloud: Dispatch<SetStateAction<CloudCycleContext | null>>;
  setCycles: Dispatch<SetStateAction<CloudCycleMetadata[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  updateSyncState: (state: CloudSyncState, error?: string) => void;
}

/** Returns the shared error message for cloud write actions when the user cannot save. */
function getCloudWriteBlockedMessage({ userId, canWrite, localFixtureActive }: CloudAccessContext): string {
  if (localFixtureActive) {
    return 'Cloud cycles are unavailable for local test accounts';
  }
  if (!userId) {
    return 'Not signed in';
  }

  return canWrite ? 'Action not allowed' : 'Premium subscription required to save cloud cycles';
}

/** Returns whether a hosted cloud mutation is allowed for the current access context. */
function isCloudMutationAllowed({ userId, canWrite, localFixtureActive }: CloudAccessContext): boolean {
  return Boolean(userId && canWrite && !localFixtureActive);
}

/** Returns true when the requested sync state already matches the current cloud context. */
function hasMatchingSyncState({
  currentCloud,
  state,
  syncError,
}: {
  currentCloud: CloudCycleContext;
  state: CloudSyncState;
  syncError?: string;
}): boolean {
  return currentCloud.syncState === state && currentCloud.lastSyncError === syncError;
}

/** Updates the current cloud context when a sync state change actually changed something. */
function applySyncStateUpdate({
  setCurrentCloud,
  state,
  syncError,
}: {
  setCurrentCloud: Dispatch<SetStateAction<CloudCycleContext | null>>;
  state: CloudSyncState;
  syncError?: string;
}): void {
  setCurrentCloud((prev) => {
    if (!prev) {
      return null;
    }

    if (hasMatchingSyncState({ currentCloud: prev, state, syncError })) {
      return prev;
    }

    return {
      ...prev,
      syncState: state,
      lastSyncError: syncError,
    };
  });
}

/** Creates the current-cloud context stored for the active forecast session. */
function createCurrentCloudContext({
  id,
  label,
  syncState,
}: {
  id: string;
  label: string;
  syncState: CloudSyncState;
}): CloudCycleContext {
  return { id, label, syncState };
}

/** Returns true when the requested cycle is already the active idle cloud selection. */
function isMatchingIdleSelection({
  currentCloud,
  cycleId,
  label,
}: {
  currentCloud: CloudCycleContext;
  cycleId: string;
  label: string;
}): boolean {
  return currentCloud.id === cycleId
    && currentCloud.label === label
    && currentCloud.syncState === 'idle'
    && !currentCloud.lastSyncError;
}

/** Updates the current cloud context when one cloud cycle is loaded. */
function syncLoadedCloudSelection({
  cycles,
  cycleId,
  setCurrentCloud,
}: {
  cycles: CloudCycleMetadata[];
  cycleId: string;
  setCurrentCloud: Dispatch<SetStateAction<CloudCycleContext | null>>;
}): void {
  const cycle = cycles.find((item) => item.id === cycleId);
  if (!cycle) {
    return;
  }

  setCurrentCloud(createCurrentCloudContext({ id: cycleId, label: cycle.label, syncState: 'saved' }));
}

/** Updates the current cloud label after a successful rename when the renamed cycle is active. */
function syncRenamedCloudSelection({
  currentCloudRef,
  setCurrentCloud,
  cycleId,
  newLabel,
}: {
  currentCloudRef: MutableRefObject<CloudCycleContext | null>;
  setCurrentCloud: Dispatch<SetStateAction<CloudCycleContext | null>>;
  cycleId: string;
  newLabel: string;
}): void {
  if (currentCloudRef.current?.id !== cycleId || currentCloudRef.current.label === newLabel) {
    return;
  }

  setCurrentCloud({ ...currentCloudRef.current, label: newLabel });
}

/** Clears the current cloud selection after a delete when the deleted cycle was active. */
function clearDeletedCloudSelection({
  currentCloudRef,
  setCurrentCloud,
  cycleId,
}: {
  currentCloudRef: MutableRefObject<CloudCycleContext | null>;
  setCurrentCloud: Dispatch<SetStateAction<CloudCycleContext | null>>;
  cycleId: string;
}): void {
  if (currentCloudRef.current?.id === cycleId) {
    setCurrentCloud(null);
  }
}

/** Starts the realtime hosted-cycle subscription for the signed-in user. */
function useCloudCycleSubscription({
  userId,
  setCycles,
  setLoading,
  setError,
  unsubscribeRef,
}: {
  userId?: string;
  setCycles: Dispatch<SetStateAction<CloudCycleMetadata[]>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  unsubscribeRef: MutableRefObject<(() => void) | null>;
}): void {
  useEffect(() => {
    // Local account fixtures exercise entitlement and UI access without touching
    // a developer's Firebase project or requiring seeded cloud data.
    if (readLocalTestAccount()) {
      setCycles([]);
      setLoading(false);
      setError(null);
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      return;
    }

    if (!userId) {
      setCycles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    unsubscribeRef.current = subscribeToCloudCycles({
      userId,
      onUpdate: (nextCycles) => {
        setCycles(nextCycles);
        setLoading(false);
      },
      onError: (nextError) => {
        console.error('Cloud cycles subscribe error:', nextError);
        setError(nextError.message);
        setLoading(false);
      },
    });

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupCloudCycleSubscription() {
      unsubscribeRef.current?.();
    };
  }, [userId, setCycles, setError, setLoading, unsubscribeRef]);
}

/** Shared mutation hook for guarded cloud-cycle write actions like rename and delete. */
function useCloudCycleMutation<TArgs extends unknown[]>({
  userId,
  canWrite,
  localFixtureActive,
  setError,
  action,
  onSuccess,
  blockedMessage = 'Action not allowed',
  fallbackError,
}: CloudAccessContext & Pick<CloudStateContext, 'setError'> & {
  action: (...args: TArgs) => Promise<CloudOperationResult>;
  onSuccess?: (...args: TArgs) => void;
  blockedMessage?: string;
  fallbackError: string;
}) {
  return useCallback(
    async (...args: TArgs): Promise<boolean> => {
      if (!isCloudMutationAllowed({ userId, canWrite, localFixtureActive })) {
        setError(blockedMessage);
        return false;
      }

      setError(null);
      const result = await action(...args);
      if (!result.success) {
        setError(result.error || fallbackError);
        return false;
      }

      onSuccess?.(...args);
      return true;
    },
    [action, blockedMessage, canWrite, fallbackError, localFixtureActive, onSuccess, setError, userId]
  );
}

/** Returns true when a cloud save can proceed for the current access context. */
function canSaveCloudCycle({ userId, canWrite, localFixtureActive }: CloudAccessContext): boolean {
  return Boolean(userId && canWrite && !localFixtureActive);
}

/** Handles a failed cloud save and updates the active sync state. */
function handleCloudSaveFailure<T>({
  result,
  setError,
  updateSyncState,
}: {
  result: CloudOperationResult<T>;
  setError: Dispatch<SetStateAction<string | null>>;
  updateSyncState: (state: CloudSyncState, error?: string) => void;
}): false {
  setError(result.error || 'Failed to save cloud cycle');
  updateSyncState('error', result.error);
  return false;
}

/** Marks an existing cloud cycle as saving without adding branching to the save callback. */
function markExistingCloudCycleSaving(
  currentCloudRef: CloudStateContext['currentCloudRef'],
  updateSyncState: CloudStateContext['updateSyncState'],
): void {
  if (currentCloudRef.current) updateSyncState('saving');
}

/** Returns the save callback for hosted cloud cycles. */
function useCloudSaveCycle({
  userId,
  canWrite,
  localFixtureActive,
  user,
  currentCloudRef,
  setCurrentCloud,
  setError,
  updateSyncState,
}: CloudAccessContext &
  Pick<CloudStateContext, 'currentCloudRef' | 'setCurrentCloud' | 'setError' | 'updateSyncState'> & {
    user: ReturnType<typeof useAuth>['user'];
  }) {
  return useCallback(
    async (
      label: string,
      cycleDate: string,
      stats: SavedCycleStats,
      payload: GFCForecastSaveData,
      workflowMetadata?: CycleMetadata,
      options?: { saveAsNew?: boolean },
    ): Promise<boolean> => {
      if (!canSaveCloudCycle({ userId, canWrite, localFixtureActive })) {
        setError(getCloudWriteBlockedMessage({ userId, canWrite, localFixtureActive }));
        return false;
      }
      const authenticatedUserId = userId as string;

      setError(null);
      markExistingCloudCycleSaving(currentCloudRef, updateSyncState);

      const result = await saveCloudCycle({
        userId: authenticatedUserId,
        label,
        cycleDate,
        stats,
        payload,
        workflowMetadata,
        existingId: options?.saveAsNew ? undefined : currentCloudRef.current?.id,
      });

      if (!result.success) {
        return handleCloudSaveFailure({ result, setError, updateSyncState });
      }

      if (result.data) {
        setCurrentCloud(createCurrentCloudContext({ id: result.data, label, syncState: 'saved' }));
      }
      queueProductMetric({ event: 'cloud_cycle_saved', user });
      trackProductEvent('cloud_save_completed');
      updateSyncState('saved');
      return true;
    },
    [canWrite, currentCloudRef, localFixtureActive, setCurrentCloud, setError, updateSyncState, user, userId]
  );
}

/** Builds the forecast payload handed to the editor after a cloud load. */
export const buildLoadedCloudForecastPayload = (
  record: Pick<import('../types/cloudCycles').CloudCycle, 'payload' | 'workflowMetadata'>,
): GFCForecastSaveData => {
  if (record.workflowMetadata) {
    return { ...record.payload, cycleMetadata: record.workflowMetadata };
  }

  const { cycleMetadata: _staleEmbedded, ...plainPayload } = record.payload;
  return { ...plainPayload, cycleMetadata: null };
};

/** Returns the load callback for hosted cloud cycles. */
function useCloudLoadCycle({
  userId,
  localFixtureActive,
  user,
  cycles,
  setCurrentCloud,
  setError,
  updateSyncState,
}: Pick<CloudStateContext, 'cycles' | 'setCurrentCloud' | 'setError' | 'updateSyncState'> &
  Pick<CloudAccessContext, 'userId' | 'localFixtureActive'> & {
    user: ReturnType<typeof useAuth>['user'];
  }) {
  return useCallback(
    async (cycleId: string): Promise<GFCForecastSaveData | null> => {
      if (!userId) {
        setError('Not signed in');
        return null;
      }
      if (localFixtureActive) {
        setError('Cloud cycles are unavailable for local test accounts');
        return null;
      }

      setError(null);
      updateSyncState('loading');

      const result = await loadCloudCycle({ userId, cycleId });
      if (!result.success || !result.data) {
        setError(result.error || 'Failed to load cloud cycle');
        updateSyncState('error', result.error);
        return null;
      }

      syncLoadedCloudSelection({ cycles, cycleId, setCurrentCloud });
      queueProductMetric({ event: 'cloud_cycle_loaded', user });
      updateSyncState('saved');
      return buildLoadedCloudForecastPayload(result.data);
    },
    [cycles, localFixtureActive, setCurrentCloud, setError, updateSyncState, user, userId]
  );
}

/** Returns the delete callback for hosted cloud cycles. */
function useCloudDeleteCycle({
  userId,
  canWrite,
  localFixtureActive,
  currentCloudRef,
  setCurrentCloud,
  setError,
}: Pick<CloudStateContext, 'currentCloudRef' | 'setCurrentCloud' | 'setError'> & CloudAccessContext) {
  return useCloudCycleMutation<[string]>({
    userId,
    canWrite,
    localFixtureActive,
    setError,
    fallbackError: 'Failed to delete cloud cycle',
    action: (cycleId) => {
      if (!userId) {
        return Promise.resolve({ success: false, error: 'Not signed in' });
      }

      return deleteCloudCycle({ userId, cycleId });
    },
    onSuccess: (cycleId) => {
      clearDeletedCloudSelection({ currentCloudRef, setCurrentCloud, cycleId });
    },
  });
}

/** Returns the rename callback for hosted cloud cycles. */
function useCloudRenameCycle({
  userId,
  canWrite,
  localFixtureActive,
  currentCloudRef,
  setCurrentCloud,
  setError,
}: Pick<CloudStateContext, 'currentCloudRef' | 'setCurrentCloud' | 'setError'> & CloudAccessContext) {
  return useCloudCycleMutation<[string, string]>({
    userId,
    canWrite,
    localFixtureActive,
    setError,
    fallbackError: 'Failed to rename cloud cycle',
    action: (cycleId, newLabel) => {
      if (!userId) {
        return Promise.resolve({ success: false, error: 'Not signed in' });
      }

      return renameCloudCycle({ userId, cycleId, newLabel });
    },
    onSuccess: (cycleId, newLabel) => {
      syncRenamedCloudSelection({ currentCloudRef, setCurrentCloud, cycleId, newLabel });
    },
  });
}

/** Returns the explicit refresh callback for cloud-cycle metadata. */
function useCloudRefreshCycles({
  userId,
  localFixtureActive,
  setCycles,
  setError,
  setLoading,
}: Pick<CloudStateContext, 'setCycles' | 'setError' | 'setLoading'> & Pick<CloudAccessContext, 'userId' | 'localFixtureActive'>) {
  return useCallback(async (): Promise<void> => {
    if (!userId || localFixtureActive) {
      return;
    }

    setLoading(true);
    const result = await listCloudCycles({ userId });
    if (result.success && result.data) {
      setCycles(result.data);
    } else {
      setError(result.error || 'Failed to refresh cloud cycles');
    }
    setLoading(false);
  }, [localFixtureActive, setCycles, setError, setLoading, userId]);
}

/** Creates the hosted cloud-cycle CRUD callbacks used by the forecast and library pages. */
function useCloudCycleOperations(context: CloudAccessContext & CloudStateContext & { user: ReturnType<typeof useAuth>['user'] }) {
  const saveCycle = useCloudSaveCycle(context);
  const loadCycle = useCloudLoadCycle(context);
  const deleteCycle = useCloudDeleteCycle(context);
  const renameCycle = useCloudRenameCycle(context);
  const refreshCycles = useCloudRefreshCycles(context);

  return {
    saveCycle,
    loadCycle,
    deleteCycle,
    renameCycle,
    refreshCycles,
  };
}

/** Keeps the current-cloud ref in sync with state so callbacks can read the latest selection. */
function useCurrentCloudRef(currentCloud: CloudCycleContext | null): MutableRefObject<CloudCycleContext | null> {
  const currentCloudRef = useRef<CloudCycleContext | null>(null);

  useEffect(() => {
    currentCloudRef.current = currentCloud;
  }, [currentCloud]);

  return currentCloudRef;
}

/** Clears cloud-library state when the user signs out so stale data never leaks across sessions. */
function useResetCloudStateOnSignOut({
  userId,
  setCycles,
  setCurrentCloud,
  setError,
  currentCloudRef,
}: {
  userId?: string;
  setCycles: Dispatch<SetStateAction<CloudCycleMetadata[]>>;
  setCurrentCloud: Dispatch<SetStateAction<CloudCycleContext | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  currentCloudRef: MutableRefObject<CloudCycleContext | null>;
}) {
  useEffect(() => {
    if (userId) {
      return;
    }

    setCycles([]);
    setCurrentCloud(null);
    setError(null);
    currentCloudRef.current = null;
  }, [currentCloudRef, setCurrentCloud, setCycles, setError, userId]);
}

/** Returns the mark/clear callbacks for the currently active cloud cycle. */
function useCurrentCloudSelectionControls(
  setCurrentCloud: Dispatch<SetStateAction<CloudCycleContext | null>>
) {
  const markAsCurrent = useCallback((cycleId: string, label: string) => {
    setCurrentCloud((prev) => {
      const nextValue = createCurrentCloudContext({ id: cycleId, label, syncState: 'idle' });
      if (prev && isMatchingIdleSelection({ currentCloud: prev, cycleId, label })) {
        return prev;
      }

      return nextValue;
    });
  }, [setCurrentCloud]);

  const clearCurrent = useCallback(() => {
    setCurrentCloud(null);
  }, [setCurrentCloud]);

  return {
    markAsCurrent,
    clearCurrent,
  };
}

/**
 * Hook for managing cloud-backed cycles
 * Handles subscription, CRUD operations, and sync state
 */
export const useCloudCycles = (): UseCloudCyclesResult => {
  const { user } = useAuth();
  const { premiumActive } = useEntitlement();
  const [cycles, setCycles] = useState<CloudCycleMetadata[]>([]);
  const [currentCloud, setCurrentCloud] = useState<CloudCycleContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const currentCloudRef = useCurrentCloudRef(currentCloud);
  const canWrite = premiumActive;
  const localFixtureActive = Boolean(readLocalTestAccount());

  useResetCloudStateOnSignOut({
    userId: user?.uid,
    setCycles,
    setCurrentCloud,
    setError,
    currentCloudRef,
  });

  const updateSyncState = useCallback((state: CloudSyncState, syncError?: string) => {
    applySyncStateUpdate({ setCurrentCloud, state, syncError });
  }, [setCurrentCloud]);

  useCloudCycleSubscription({
    userId: user?.uid,
    setCycles,
    setLoading,
    setError,
    unsubscribeRef,
  });

  const operations = useCloudCycleOperations({
    userId: user?.uid,
    canWrite,
    localFixtureActive,
    user,
    cycles,
    currentCloudRef,
    setCurrentCloud,
    setCycles,
    setError,
    setLoading,
    updateSyncState,
  });

  const { markAsCurrent, clearCurrent } = useCurrentCloudSelectionControls(setCurrentCloud);

  return {
    cycles,
    currentCloud,
    loading,
    error,
    saveCycle: operations.saveCycle,
    loadCycle: operations.loadCycle,
    deleteCycle: operations.deleteCycle,
    renameCycle: operations.renameCycle,
    markAsCurrent,
    clearCurrent,
    refreshCycles: operations.refreshCycles,
    updateSyncState,
  };
};
