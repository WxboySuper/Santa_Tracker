import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type FC, type PropsWithChildren } from 'react';
import { useSelector } from 'react-redux';
import { useAuth } from '../auth/AuthProvider';
import { selectWorkflowMetadata } from '../store/forecastSlice';
import type { RootState } from '../store';
import {
  createWorkflowAwarenessWriteQueue,
  deleteWorkflowAwareness,
  deleteOneWorkflowAwareness,
  listWorkflowAwareness,
  saveWorkflowAwareness,
  type WorkflowAwarenessWriteQueue,
} from '../lib/workflowAwarenessService';
import {
  createAwarenessMetadata,
  getAwarenessRecommendations,
  isCurrentAwarenessConsent,
  WORKFLOW_AWARENESS_CONSENT_VERSION,
  type WorkflowAwarenessConsent,
  type WorkflowAwarenessMetadata,
  type WorkflowAwarenessRecommendation,
} from '../types/workflowAwareness';

const AWARENESS_CONSENT_KEY_PREFIX = 'gfc-workflow-awareness-consent:';
const AWARENESS_CONSENT_EVENT = 'gfc-workflow-awareness-consent-changed';

/** Builds the per-user local-storage key for awareness consent. */
const getConsentKey = (userId: string): string => `${AWARENESS_CONSENT_KEY_PREFIX}${userId}`;

/** Reads opt-in consent without enabling awareness when storage is unavailable. */
export const readWorkflowAwarenessConsent = (userId: string | undefined): WorkflowAwarenessConsent => {
  if (!userId || typeof localStorage === 'undefined') return { enabled: false, version: WORKFLOW_AWARENESS_CONSENT_VERSION };
  try {
    const raw = localStorage.getItem(getConsentKey(userId));
    if (!raw) return { enabled: false, version: WORKFLOW_AWARENESS_CONSENT_VERSION };
    const parsed = JSON.parse(raw) as Partial<WorkflowAwarenessConsent>;
    return {
      enabled: parsed.enabled === true,
      version: typeof parsed.version === 'number' ? parsed.version : 0,
    };
  } catch {
    return { enabled: false, version: WORKFLOW_AWARENESS_CONSENT_VERSION };
  }
};

/** Persists consent and notifies other mounted consumers in this tab. */
export const writeWorkflowAwarenessConsent = (userId: string, consent: WorkflowAwarenessConsent): void => {
  try {
    localStorage.setItem(getConsentKey(userId), JSON.stringify(consent));
    window.dispatchEvent(new CustomEvent(AWARENESS_CONSENT_EVENT, { detail: { userId } }));
  } catch {
    // A blocked local store means awareness remains disabled for this session.
  }
};

export interface WorkflowAwarenessSyncResult {
  enabled: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  records: WorkflowAwarenessMetadata[];
  recommendations: WorkflowAwarenessRecommendation[];
  setEnabled: (enabled: boolean) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const WorkflowAwarenessContext = createContext<WorkflowAwarenessSyncResult | null>(null);

/** Returns the shared awareness state, or a disabled fallback outside its provider. */
export const useWorkflowAwareness = (): WorkflowAwarenessSyncResult => {
  const context = useContext(WorkflowAwarenessContext);
  if (context) return context;
  return {
    enabled: false,
    loading: false,
    saving: false,
    error: null,
    records: [],
    recommendations: [],
    setEnabled: () => Promise.resolve(false),
    refresh: () => Promise.resolve(),
  };
};

interface ActiveRequest {
  generation: number;
  userId?: string;
  queue: WorkflowAwarenessWriteQueue;
}

/** Checks that an async response still belongs to the active auth generation. */
export const isWorkflowAwarenessResponseCurrent = ({
  requestGeneration,
  currentGeneration,
  requestUserId,
  currentUserId,
}: {
  requestGeneration: number;
  currentGeneration: number;
  requestUserId?: string;
  currentUserId?: string;
}): boolean => requestGeneration === currentGeneration && requestUserId === currentUserId;

/** Applies the generation and user identity guard to a pending operation. */
const isActiveRequest = (active: ActiveRequest, generation: number, userId?: string): boolean =>
  isWorkflowAwarenessResponseCurrent({
    requestGeneration: generation,
    currentGeneration: active.generation,
    requestUserId: userId,
    currentUserId: active.userId,
  });

/** Removes one stale awareness record while keeping UI and async auth state aligned. */
const queueAwarenessDeletion = ({
  active,
  generation,
  userId,
  cycleId,
  removeRecord,
  reportError,
}: {
  active: ActiveRequest;
  generation: number;
  userId: string;
  cycleId: string;
  removeRecord: () => void;
  reportError: (error: unknown) => void;
}): void => {
  removeRecord();
  active.queue.enqueue(() => deleteOneWorkflowAwareness(userId, cycleId)).catch((nextError: unknown) => {
    if (isActiveRequest(active, generation, userId)) reportError(nextError);
  });
};

/**
 * Opt-in metadata-only awareness synchronization. Every async completion is
 * checked against the current user generation so auth switches cannot hydrate
 * or mutate the next user's recommendation state.
 */
export const useWorkflowAwarenessSync = (): WorkflowAwarenessSyncResult => {
  const { user } = useAuth();
  const userId = user?.uid;
  const workflowMetadata = useSelector((state: RootState) => selectWorkflowMetadata(state));
  const [consent, setConsent] = useState<WorkflowAwarenessConsent>(() => readWorkflowAwarenessConsent(userId));
  const [records, setRecords] = useState<WorkflowAwarenessMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef<ActiveRequest>({ generation: 0, userId, queue: createWorkflowAwarenessWriteQueue() });
  const consentRef = useRef(consent);
  const metadataRef = useRef(workflowMetadata);
  const previousConsentRef = useRef(consent);
  const disableRequestedRef = useRef(false);
  const awarenessSyncKey = workflowMetadata
    ? [
      workflowMetadata.id,
      workflowMetadata.status,
      workflowMetadata.updatedAt,
      ...workflowMetadata.outlookVersions.map((version) => `${version.version}:${version.status}:${version.createdAt}:${version.derivedFrom ?? ''}`),
    ].join('|')
    : null;

  useEffect(() => {
    consentRef.current = consent;
  }, [consent]);

  useEffect(() => {
    const active = activeRef.current;
    active.generation += 1;
    active.userId = userId;
    active.queue = createWorkflowAwarenessWriteQueue();
    const generation = active.generation;
    const nextConsent = readWorkflowAwarenessConsent(userId);
    previousConsentRef.current = nextConsent;
    consentRef.current = nextConsent;
    setConsent(nextConsent);
    setRecords([]);
    setError(null);

    if (!userId || !isCurrentAwarenessConsent(nextConsent)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    listWorkflowAwareness({ userId, consent: nextConsent })
      .then((nextRecords) => {
        if (!isActiveRequest(active, generation, userId)) return;
        setRecords(nextRecords);
      })
      .catch((nextError: unknown) => {
        if (!isActiveRequest(active, generation, userId)) return;
        setError(nextError instanceof Error ? nextError.message : 'Unable to load workflow awareness.');
      })
      .finally(() => {
        if (isActiveRequest(active, generation, userId)) setLoading(false);
      });
  }, [userId]);

  // Account-page consent changes arrive as an event; deleting is still queued here
  // so they cannot leave a stale record after a disable action.
  useEffect(() => {
    const previousConsent = previousConsentRef.current;
    previousConsentRef.current = consent;
    if (!userId || !previousConsent.enabled || consent.enabled || disableRequestedRef.current) {
      disableRequestedRef.current = false;
      return;
    }

    const active = activeRef.current;
    const generation = active.generation;
    active.queue.enqueue(() => deleteWorkflowAwareness(userId)).catch((nextError: unknown) => {
      if (isActiveRequest(active, generation, userId)) {
        setError(nextError instanceof Error ? nextError.message : 'Unable to disable workflow awareness.');
      }
    });
  }, [consent, userId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    /** Refreshes consent when the account settings broadcast changes. */
    const handleConsentChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId !== userId || !userId) return;
      setConsent(readWorkflowAwarenessConsent(userId));
    };
    window.addEventListener(AWARENESS_CONSENT_EVENT, handleConsentChanged);
    return () => window.removeEventListener(AWARENESS_CONSENT_EVENT, handleConsentChanged);
  }, [userId]);

  const refresh = useCallback(async () => {
    const active = activeRef.current;
    const generation = active.generation;
    const currentConsent = consentRef.current;
    if (!userId || !isCurrentAwarenessConsent(currentConsent)) {
      setRecords([]);
      return;
    }
    setLoading(true);
    try {
      const nextRecords = await listWorkflowAwareness({ userId, consent: currentConsent });
      if (isActiveRequest(active, generation, userId)) setRecords(nextRecords);
    } catch (nextError) {
      if (isActiveRequest(active, generation, userId)) {
        setError(nextError instanceof Error ? nextError.message : 'Unable to load workflow awareness.');
      }
    } finally {
      if (isActiveRequest(active, generation, userId)) setLoading(false);
    }
  }, [userId]);

  const setEnabled = useCallback(async (enabled: boolean): Promise<boolean> => {
    const active = activeRef.current;
    const generation = active.generation;
    if (!userId) return false;

    const nextConsent: WorkflowAwarenessConsent = {
      enabled,
      version: WORKFLOW_AWARENESS_CONSENT_VERSION,
    };
    // Update the guard before enqueueing so saves triggered by the same render cannot pass stale consent.
    consentRef.current = nextConsent;
    setConsent(nextConsent);
    writeWorkflowAwarenessConsent(userId, nextConsent);
    setError(null);

    if (!enabled) {
      disableRequestedRef.current = true;
      setRecords([]);
      try {
        await active.queue.enqueue(() => deleteWorkflowAwareness(userId));
        return isActiveRequest(active, generation, userId);
      } catch (nextError) {
        if (isActiveRequest(active, generation, userId)) {
          setError(nextError instanceof Error ? nextError.message : 'Unable to disable workflow awareness.');
        }
        return false;
      }
    }

    try {
      await refresh();
      return isActiveRequest(active, generation, userId);
    } catch {
      return false;
    }
  }, [refresh, userId]);

  useEffect(() => {
    const currentConsent = consentRef.current;
    const metadata = metadataRef.current;
    const active = activeRef.current;
    const currentUserId = userId;
    metadataRef.current = workflowMetadata;
    if (!currentUserId || !isCurrentAwarenessConsent(currentConsent)) return undefined;
    const generation = active.generation;
    const previousCycleId = metadata?.id;
    if (previousCycleId && (!workflowMetadata || previousCycleId !== workflowMetadata.id)) {
      queueAwarenessDeletion({
        active,
        generation,
        userId: currentUserId,
        cycleId: previousCycleId,
        removeRecord: () => setRecords((previous) => previous.filter((entry) => entry.cycleId !== previousCycleId)),
        reportError: (nextError) => setError(nextError instanceof Error ? nextError.message : 'Unable to clear workflow awareness.'),
      });
    }
    if (!workflowMetadata) {
      return undefined;
    }
    const awarenessMetadata = createAwarenessMetadata(workflowMetadata);
    setSaving(true);
    const savePromise = active.queue.enqueue(() => saveWorkflowAwareness({
      userId: currentUserId,
      metadata: awarenessMetadata,
      consent: currentConsent,
    }));
    savePromise
      .then(() => {
        if (isActiveRequest(active, generation, currentUserId)) {
          setRecords((previous) => [awarenessMetadata, ...previous.filter((entry) => entry.cycleId !== awarenessMetadata.cycleId)]);
        }
      })
      .catch((nextError: unknown) => {
        if (isActiveRequest(active, generation, currentUserId)) {
          setError(nextError instanceof Error ? nextError.message : 'Unable to sync workflow awareness.');
        }
      })
      .finally(() => {
        if (isActiveRequest(active, generation, currentUserId)) setSaving(false);
      });
    return undefined;
  }, [workflowMetadata, awarenessSyncKey, userId, consent]);

  const recommendations = useMemo(() => getAwarenessRecommendations(records), [records]);

  return { enabled: isCurrentAwarenessConsent(consent), loading, saving, error, records, recommendations, setEnabled, refresh };
};

/** Provides opt-in awareness synchronization to the application tree. */
export const WorkflowAwarenessProvider: FC<PropsWithChildren> = ({ children }) => createElement(
  WorkflowAwarenessContext.Provider,
  { value: useWorkflowAwarenessSync() },
  children,
);

/** Small account-page adapter that shares the same consent key without starting a sync. */
export const useWorkflowAwarenessConsentSetting = (): {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
} => {
  const { user } = useAuth();
  const userId = user?.uid;
  const [consent, setConsent] = useState(() => readWorkflowAwarenessConsent(userId));
  useEffect(() => {
    setConsent(readWorkflowAwarenessConsent(userId));
  }, [userId]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    /** Refreshes this adapter when another consumer changes consent. */
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId === userId) setConsent(readWorkflowAwarenessConsent(userId));
    };
    window.addEventListener(AWARENESS_CONSENT_EVENT, listener);
    return () => window.removeEventListener(AWARENESS_CONSENT_EVENT, listener);
  }, [userId]);
  const setEnabled = useCallback((enabled: boolean) => {
    if (!userId) return;
    const nextConsent = { enabled, version: WORKFLOW_AWARENESS_CONSENT_VERSION };
    setConsent(nextConsent);
    writeWorkflowAwarenessConsent(userId, nextConsent);
  }, [userId]);
  return { enabled: isCurrentAwarenessConsent(consent), setEnabled };
};
