import { collection, deleteField, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { db } from './firebase';
import { CloudCycleMetadata, CloudCycle, CloudOperationResult } from '../types/cloudCycles';
import { GFCForecastSaveData } from '../types/outlooks';
import type { CycleMetadata } from '../types/workflow';
import { boundWorkflowMetadataForPersistence, isValidWorkflowMetadata } from './workflowMetadataContract';
import { SavedCycleStats } from '../store/forecastSlice';
import { validateForecastData } from '../utils/fileUtils';

const LEGACY_USER_SETTINGS_COLLECTION = 'userSettings';
const CLOUD_CYCLES_COLLECTION = 'cloudCycles';

interface CloudCycleDocument extends CloudCycleMetadata {
  payloadJson: string;
  payloadBytes: number;
  /** v2 workflow metadata serialized as JSON in the Firestore document. */
  workflowMetadata?: CycleMetadata;
}

interface NormalizeMetadataParams {
  cycleId: string;
  rawMetadata: Record<string, unknown> | undefined;
  fallbackUserId: string;
}

interface NormalizeCloudCycleRecordParams {
  cycleId: string;
  rawRecord: unknown;
  fallbackUserId: string;
}

interface NormalizeCloudCycleMetadataRecordParams {
  cycleId: string;
  rawRecord: unknown;
  fallbackUserId: string;
}

interface ReadCloudCyclesFromQueryParams {
  snapshot: { docs: Array<{ id: string; data: () => unknown }> };
  fallbackUserId: string;
}

interface UserCycleLookupParams {
  userId: string;
  cycleId: string;
}

interface ListCloudCyclesParams {
  userId: string;
}

interface RenameCloudCycleParams extends UserCycleLookupParams {
  newLabel: string;
}

interface CloudCycleSubscriptionParams {
  userId: string;
  onUpdate: (cycles: CloudCycleMetadata[]) => void;
  onError?: (error: Error) => void;
}

interface SaveCloudCycleParams {
  userId: string;
  label: string;
  cycleDate: string;
  stats: SavedCycleStats;
  payload: GFCForecastSaveData;
  workflowMetadata?: CycleMetadata;
  isReadOnly?: boolean;
  existingId?: string;
}

type LegacyCloudCyclesValue = string | Record<string, unknown> | undefined;

type LegacyUserSettingsDocument = {
  cloudCycles?: LegacyCloudCyclesValue;
};

/** Returns a stable no-op unsubscribe callback when the Firestore subscription cannot be created. */
function noopUnsubscribe(): void {
  return undefined;
}

/**
 * Computes a simple hash of the cycle payload for change detection
 * Uses a simple string hash rather than cryptographic hashing
 */
const computePayloadHash = (payload: GFCForecastSaveData): string => {
  const jsonStr = JSON.stringify(payload);
  let hash = 0;
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Force the rolling hash back into a signed 32-bit integer.
  }
  return Math.abs(hash).toString(36).substring(0, 12);
};

/** Returns true when the value is a plain object record rather than an array or primitive. */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** Reads a stored cloud payload from either a JSON string or already-parsed object value. */
export const parseCloudCyclePayload = (value: unknown): GFCForecastSaveData | null => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return validateForecastData(parsed) ? (parsed as GFCForecastSaveData) : null;
    } catch {
      return null;
    }
  }

  if (validateForecastData(value)) {
    return value as GFCForecastSaveData;
  }

  return null;
};

/** Returns the shared Firestore collection reference for hosted cloud-cycle documents. */
const getCloudCyclesCollectionRef = () => {
  if (!db) {
    throw new Error('Firestore is not initialized');
  }

  return collection(db, CLOUD_CYCLES_COLLECTION);
};

/** Returns the Firestore document reference for a specific cloud cycle. */
const getCloudCycleDocRef = (cycleId: string) => doc(getCloudCyclesCollectionRef(), cycleId);

/** Reads the latest Firestore snapshot for one cloud cycle document. */
const getCloudCycleDocSnapshot = (cycleId: string) => getDoc(getCloudCycleDocRef(cycleId));

/** Returns the legacy user-settings document where pre-Phase 4 cloud cycles were stored. */
const getLegacyUserSettingsRef = (userId: string) => {
  if (!db) {
    throw new Error('Firestore is not initialized');
  }

  return doc(db, LEGACY_USER_SETTINGS_COLLECTION, userId);
};

/** Reads a timestamp-like string while falling back to a safe ISO date when missing. */
const readTimestampString = (value: unknown, fallback = new Date(0).toISOString()): string =>
  typeof value === 'string' && value ? value : fallback;

/** Reads a required non-empty string from a stored metadata field. */
const readRequiredText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

/** Reads a stored number field, defaulting missing values to zero. */
const readStoredCount = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** Returns the serialized cloud payload plus its UTF-8 byte length for storage-safe writes. */
export const createCloudCyclePayloadStorage = (payload: GFCForecastSaveData): Pick<CloudCycleDocument, 'payloadJson' | 'payloadBytes'> => {
  const payloadJson = JSON.stringify(payload);
  return {
    payloadJson,
    payloadBytes: new TextEncoder().encode(payloadJson).length,
  };
};

/** Normalizes stored cloud-cycle metadata into the current metadata contract. */
const normalizeStoredMetadata = ({
  cycleId,
  rawMetadata,
  fallbackUserId,
}: NormalizeMetadataParams): CloudCycleMetadata | null => {
  if (!rawMetadata) {
    return null;
  }

  const label = readRequiredText(rawMetadata.label);
  const cycleDate = readRequiredText(rawMetadata.cycleDate);

  if (!label || !cycleDate) {
    return null;
  }

  return {
    id: readRequiredText(rawMetadata.id) ?? cycleId,
    userId: readRequiredText(rawMetadata.userId) ?? fallbackUserId,
    label,
    cycleDate,
    createdAt: readTimestampString(rawMetadata.createdAt),
    updatedAt: readTimestampString(rawMetadata.updatedAt, readTimestampString(rawMetadata.createdAt)),
    forecastDays: readStoredCount(rawMetadata.forecastDays),
    totalOutlooks: readStoredCount(rawMetadata.totalOutlooks),
    totalFeatures: readStoredCount(rawMetadata.totalFeatures),
    isReadOnly: Boolean(rawMetadata.isReadOnly),
    payloadHash: readRequiredText(rawMetadata.payloadHash) ?? undefined,
  };
};

/** Normalizes one raw Firestore or legacy cloud-cycle record into the app's runtime shape. */
const normalizeCloudCycleRecord = ({
  cycleId,
  rawRecord,
  fallbackUserId,
}: NormalizeCloudCycleRecordParams): CloudCycle | null => {
  if (!isPlainObject(rawRecord)) {
    return null;
  }

  const metadataSource = isPlainObject(rawRecord.metadata) ? (rawRecord.metadata as Record<string, unknown>) : rawRecord;
  const payload = parseCloudCyclePayload(rawRecord.payloadJson ?? rawRecord.payload);

  const metadata = normalizeStoredMetadata({ cycleId, rawMetadata: metadataSource, fallbackUserId });
  if (!metadata || !payload) {
    return null;
  }

  // Keep the Firestore contract strict on the client too: invalid nested
  // metadata is ignored rather than trusted as workflow state.
  const workflowMetadata = isValidWorkflowMetadata(rawRecord.workflowMetadata) &&
    rawRecord.workflowMetadata.cycleDate === metadata.cycleDate
    ? rawRecord.workflowMetadata
    : undefined;

  return {
    ...metadata,
    payload,
    ...(workflowMetadata ? { workflowMetadata } : {}),
  };
};

/** Normalizes one raw Firestore cloud-cycle document into list-safe metadata without parsing the payload. */
const normalizeCloudCycleMetadataRecord = ({
  cycleId,
  rawRecord,
  fallbackUserId,
}: NormalizeCloudCycleMetadataRecordParams): CloudCycleMetadata | null => {
  if (!isPlainObject(rawRecord)) {
    return null;
  }

  const metadataSource = isPlainObject(rawRecord.metadata) ? (rawRecord.metadata as Record<string, unknown>) : rawRecord;
  return normalizeStoredMetadata({ cycleId, rawMetadata: metadataSource, fallbackUserId });
};

/** Keeps workflow metadata only when it belongs to the same cycle date. */
const getCompatibleWorkflowMetadata = (workflowMetadata: unknown, cycleDate: string): CycleMetadata | undefined => {
  if (!isPlainObject(workflowMetadata)) return undefined;
  if (workflowMetadata.cycleDate !== cycleDate) return undefined;
  if (!isValidWorkflowMetadata(workflowMetadata)) return undefined;

  const bounded = boundWorkflowMetadataForPersistence(workflowMetadata);
  return isValidWorkflowMetadata(bounded) ? bounded : undefined;
};

/** Serializes a runtime cloud cycle back into the Firestore storage format. */
const serializeCloudCycleDocument = (cycle: CloudCycle): CloudCycleDocument => {
  const { payload, workflowMetadata, ...metadata } = cycle;
  const payloadStats = createCloudCyclePayloadStorage(payload);
  const validWorkflowMetadata = getCompatibleWorkflowMetadata(workflowMetadata, metadata.cycleDate);

  return {
    ...metadata,
    ...payloadStats,
    ...(validWorkflowMetadata ? { workflowMetadata: validWorkflowMetadata } : {}),
  };
};

/** Strips the saved payload from a cloud cycle so library APIs can expose metadata-only objects. */
const toCloudCycleMetadata = ({ payload: _payload, workflowMetadata: _wm, ...cycleMetadata }: CloudCycle): CloudCycleMetadata => cycleMetadata;

/** Sorts cloud-cycle metadata from newest to oldest update time. */
const sortCloudCycleMetadata = (cycles: CloudCycleMetadata[]): CloudCycleMetadata[] =>
  [...cycles].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

/** Creates a collision-resistant id for new hosted cloud cycles. */
const createCloudCycleId = (userId: string, cycleDate: string): string =>
  `${userId}-${cycleDate}-${uuidv4()}`;

/** Performs the first metadata fetch for a cloud subscription before realtime updates attach. */
const bootstrapCloudCycleSubscription = async ({
  userId,
  isActive,
  onUpdate,
  onError,
}: {
  userId: string;
  isActive: () => boolean;
  onUpdate: (cycles: CloudCycleMetadata[]) => void;
  onError?: (error: Error) => void;
}): Promise<void> => {
  try {
    const result = await listCloudCycles({ userId });
    if (!isActive()) {
      return;
    }

    onUpdate(sortCloudCycleMetadata(result.success && result.data ? result.data : []));
  } catch (error) {
    console.error('Error bootstrapping cloud cycles:', error);
    if (isActive()) {
      onError?.(error as Error);
    }
  }
};

/** Converts a Firestore query snapshot into normalized cloud-cycle records, including payload validation. */
const readCloudCyclesFromQuery = ({ snapshot, fallbackUserId }: ReadCloudCyclesFromQueryParams): CloudCycle[] =>
  snapshot.docs
    .map((cycleDoc) => normalizeCloudCycleRecord({ cycleId: cycleDoc.id, rawRecord: cycleDoc.data(), fallbackUserId }))
    .filter((cycle): cycle is CloudCycle => Boolean(cycle));

/** Converts a Firestore query snapshot into normalized cloud-cycle metadata without parsing payload JSON. */
const readCloudCycleMetadataFromQuery = ({ snapshot, fallbackUserId }: ReadCloudCyclesFromQueryParams): CloudCycleMetadata[] =>
  snapshot.docs
    .map((cycleDoc) =>
      normalizeCloudCycleMetadataRecord({ cycleId: cycleDoc.id, rawRecord: cycleDoc.data(), fallbackUserId })
    )
    .filter((cycle): cycle is CloudCycleMetadata => Boolean(cycle));

/** Reads older cloud-cycle data from the legacy user-settings document if present. */
const readLegacyCloudCycles = async (userId: string): Promise<CloudCycle[]> => {
  try {
    const snapshot = await getDoc(getLegacyUserSettingsRef(userId));
    const legacyData = snapshot.data() as LegacyUserSettingsDocument | undefined;
    const rawValue = legacyData?.cloudCycles;

    if (!rawValue) {
      return [];
    }

    const rawStore = typeof rawValue === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(rawValue) as unknown;
            return isPlainObject(parsed) ? parsed : null;
          } catch {
            return null;
          }
        })()
      : isPlainObject(rawValue)
        ? rawValue
        : null;

    if (!rawStore) {
      return [];
    }

    return Object.entries(rawStore)
      .map(([cycleId, rawRecord]) => normalizeCloudCycleRecord({ cycleId, rawRecord, fallbackUserId: userId }))
      .filter((cycle): cycle is CloudCycle => Boolean(cycle));
  } catch (error) {
    console.error('Error reading legacy cloud cycles:', error);
    return [];
  }
};

/** Migrates legacy cloud cycles into the dedicated `cloudCycles` collection and clears the old field. */
const migrateLegacyCloudCycles = async (userId: string, cycles: CloudCycle[]): Promise<void> => {
  if (!cycles.length) {
    return;
  }

  await Promise.all(
    cycles.map(async (cycle) => {
      await setDoc(getCloudCycleDocRef(cycle.id), serializeCloudCycleDocument(cycle));
    })
  );

  await setDoc(
    getLegacyUserSettingsRef(userId),
    {
      cloudCycles: deleteField(),
    },
    { merge: true }
  );
};

/** Reads all cloud cycles for a user, transparently migrating legacy records when needed. */
const readCloudCyclesForUser = async (userId: string): Promise<CloudCycle[]> => {
  const snapshot = await getDocs(query(getCloudCyclesCollectionRef(), where('userId', '==', userId)));
  const cycles = readCloudCyclesFromQuery({ snapshot, fallbackUserId: userId });

  if (cycles.length > 0) {
    return cycles.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }

  const legacyCycles = await readLegacyCloudCycles(userId);
  if (legacyCycles.length > 0) {
    await migrateLegacyCloudCycles(userId, legacyCycles);
  }

  return legacyCycles.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
};

/** Fetches one cloud cycle by id, including legacy fallback and migration support. */
const fetchCloudCycleById = async ({ userId, cycleId }: UserCycleLookupParams): Promise<CloudCycle | null> => {
  const docSnapshot = await getCloudCycleDocSnapshot(cycleId);
  if (docSnapshot.exists()) {
    const cycle = normalizeCloudCycleRecord({ cycleId: docSnapshot.id, rawRecord: docSnapshot.data(), fallbackUserId: userId });
    if (cycle && cycle.userId === userId) {
      return cycle;
    }
  }

  const legacyCycles = await readLegacyCloudCycles(userId);
  const legacyMatch = legacyCycles.find((cycle) => cycle.id === cycleId) ?? null;
  if (legacyMatch) {
    await migrateLegacyCloudCycles(userId, legacyCycles);
  }

  return legacyMatch;
};

/** Returns an existing cloud cycle only when it belongs to the current signed-in user. */
const getOwnedCloudCycle = async ({ userId, cycleId }: UserCycleLookupParams): Promise<CloudCycle | null> => {
  const existingSnapshot = await getCloudCycleDocSnapshot(cycleId);
  if (!existingSnapshot.exists()) {
    return null;
  }

  const existingCycle = normalizeCloudCycleRecord({ cycleId, rawRecord: existingSnapshot.data(), fallbackUserId: userId });
  if (!existingCycle || existingCycle.userId !== userId) {
    return null;
  }

  return existingCycle;
};

/**
 * Saves a new cloud cycle or updates an existing one
 */
export const saveCloudCycle = async (
  params: SaveCloudCycleParams
): Promise<CloudOperationResult<string>> => {
  try {
    const {
      userId,
      label,
      cycleDate,
      stats,
      payload,
      workflowMetadata: requestedWorkflowMetadata,
      isReadOnly = false,
      existingId,
    } = params;
    const cycleId = existingId || createCloudCycleId(userId, cycleDate);
    const now = new Date().toISOString();
    const existingCycle = existingId ? await getOwnedCloudCycle({ userId, cycleId: existingId }) : null;

    if (existingId && !existingCycle) {
      return {
        success: false,
        error: 'Cloud cycle not found',
      };
    }

    const metadata: CloudCycleMetadata = {
      id: cycleId,
      userId,
      label,
      cycleDate,
      createdAt: existingCycle?.createdAt ?? now,
      updatedAt: now,
      forecastDays: stats.forecastDays,
      totalOutlooks: stats.totalOutlooks,
      totalFeatures: stats.totalFeatures,
      isReadOnly,
      payloadHash: computePayloadHash(payload),
    };
    const payloadStats = createCloudCyclePayloadStorage(payload);
    const validWorkflowMetadata = getCompatibleWorkflowMetadata(requestedWorkflowMetadata, cycleDate);

    await setDoc(getCloudCycleDocRef(cycleId), {
      ...metadata,
      ...payloadStats,
      ...(validWorkflowMetadata ? { workflowMetadata: validWorkflowMetadata } : {}),
    });

    return { success: true, data: cycleId };
  } catch (error) {
    console.error('Error saving cloud cycle:', error);
    return {
      success: false,
      error: `Failed to save cloud cycle: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/** Loads a specific cloud cycle for the requested user. */
export const loadCloudCycle = async (
  params: UserCycleLookupParams
): Promise<CloudOperationResult<CloudCycle>> => {
  try {
    const record = await fetchCloudCycleById(params);

    if (!record) {
      return {
        success: false,
        error: 'Cloud cycle not found',
      };
    }

    return {
      success: true,
      data: record,
    };
  } catch (error) {
    console.error('Error loading cloud cycle:', error);
    return {
      success: false,
      error: `Failed to load cloud cycle: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/** Deletes a cloud cycle only when it belongs to the requested user. */
export const deleteCloudCycle = async (
  params: UserCycleLookupParams
): Promise<CloudOperationResult> => {
  try {
    const existingCycle = await getOwnedCloudCycle(params);
    if (!existingCycle) {
      return { success: true };
    }

    await deleteDoc(getCloudCycleDocRef(params.cycleId));

    return { success: true };
  } catch (error) {
    console.error('Error deleting cloud cycle:', error);
    return {
      success: false,
      error: `Failed to delete cloud cycle: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/** Renames a cloud cycle only when it belongs to the requested user. */
export const renameCloudCycle = async (
  params: RenameCloudCycleParams
): Promise<CloudOperationResult> => {
  try {
    const existing = await getOwnedCloudCycle(params);
    if (!existing) {
      return {
        success: false,
        error: 'Cloud cycle not found',
      };
    }

    const nextMetadata: CloudCycle = {
      ...existing,
      label: params.newLabel,
      updatedAt: new Date().toISOString(),
      payloadHash: computePayloadHash(existing.payload),
    };

    await setDoc(getCloudCycleDocRef(params.cycleId), serializeCloudCycleDocument(nextMetadata));

    return { success: true };
  } catch (error) {
    console.error('Error renaming cloud cycle:', error);
    return {
      success: false,
      error: `Failed to rename cloud cycle: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Lists all cloud cycles for a user as metadata-only objects.
 * Payload JSON is still stored in the same Firestore document today, so this avoids parse cost but not document transfer size.
 */
export async function listCloudCycles(
  { userId }: ListCloudCyclesParams
): Promise<CloudOperationResult<CloudCycleMetadata[]>> {
  try {
    const snapshot = await getDocs(query(getCloudCyclesCollectionRef(), where('userId', '==', userId)));
    const metadata = readCloudCycleMetadataFromQuery({ snapshot, fallbackUserId: userId });

    if (metadata.length > 0) {
      return { success: true, data: sortCloudCycleMetadata(metadata) };
    }

    const cycles = await readCloudCyclesForUser(userId);

    return { success: true, data: sortCloudCycleMetadata(cycles.map(toCloudCycleMetadata)) };
  } catch (error) {
    console.error('Error listing cloud cycles:', error);
    return {
      success: false,
      error: `Failed to list cloud cycles: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Subscribes to cloud cycles list for real-time updates
 */
export const subscribeToCloudCycles = (
  { userId, onUpdate, onError }: CloudCycleSubscriptionParams
): (() => void) => {
  try {
    const cyclesQuery = query(getCloudCyclesCollectionRef(), where('userId', '==', userId));
    let isActive = true;

    bootstrapCloudCycleSubscription({
      userId,
      isActive: () => isActive,
      onUpdate,
      onError,
    });

    const unsubscribe = onSnapshot(
      cyclesQuery,
      (querySnapshot) => {
        const metadata = readCloudCycleMetadataFromQuery({ snapshot: querySnapshot, fallbackUserId: userId });
        onUpdate(sortCloudCycleMetadata(metadata));
      },
      (error) => {
        console.error('Error subscribing to cloud cycles:', error);
        onError?.(error as Error);
      }
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  } catch (error) {
    console.error('Error setting up cloud cycles subscription:', error);
    if (onError && error instanceof Error) onError(error);
    return noopUnsubscribe;
  }
};

/**
 * Checks if a local cycle differs from the remote version
 */
export const hasRemoteChanges = (
  localPayload: GFCForecastSaveData,
  remoteMetadata: CloudCycleMetadata
): boolean => {
  const localHash = computePayloadHash(localPayload);
  return localHash !== remoteMetadata.payloadHash;
};
