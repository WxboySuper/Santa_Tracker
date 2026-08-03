import {
  collection,
  deleteDoc,
  deleteDoc as removeDoc,
  doc,
  getDocs,
  query,
  setDoc,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  WORKFLOW_AWARENESS_CONSENT_VERSION,
  WORKFLOW_AWARENESS_SCHEMA_VERSION,
  type WorkflowAwarenessConsent,
  type WorkflowAwarenessMetadata,
  type WorkflowAwarenessRecord,
  type WorkflowAwarenessDocument,
  isCurrentAwarenessConsent,
} from '../types/workflowAwareness';

const AWARENESS_COLLECTION = 'workflowAwareness';

const RECORD_KEYS = ['consentVersion', 'schemaVersion', 'metadata'];
const FLAT_RECORD_KEYS = ['consentVersion', 'schemaVersion', 'cycleId', 'workflowId', 'cycleDate', 'status', 'outlookVersions', 'createdAt', 'updatedAt'];
const METADATA_KEYS = ['cycleId', 'workflowId', 'cycleDate', 'status', 'outlookVersions', 'createdAt', 'updatedAt'];
const VERSION_KEYS = ['version', 'status', 'createdAt', 'derivedFrom'];
const CYCLE_STATUSES = new Set(['in-progress', 'completed', 'completed-with-omissions']);
const OUTLOOK_STATUSES = new Set(['in-progress', 'completed', 'skipped', 'omitted']);

type AwarenessSnapshot = QuerySnapshot<DocumentData>;

/** Compares an object's keys with an exact allowlist. */
const sortedKeysEqual = (value: Record<string, unknown>, keys: string[]): boolean => {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
};

/** Checks that a persisted string field is present and non-blank. */
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Validates one privacy-safe outlook version entry. */
const isValidOutlookVersion = (value: unknown): value is WorkflowAwarenessRecord['outlookVersions'][number] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const version = value as Record<string, unknown>;
  if (!Object.keys(version).every((key) => VERSION_KEYS.includes(key))) return false;
  if (!['version', 'status', 'createdAt'].every((key) => key in version)) return false;
  if (typeof version.version !== 'number' || !Number.isInteger(version.version) || version.version < 1) return false;
  if (typeof version.status !== 'string' || !OUTLOOK_STATUSES.has(version.status)) return false;
  if (!isNonEmptyString(version.createdAt)) return false;
  return version.derivedFrom === undefined
    || (typeof version.derivedFrom === 'number' && Number.isInteger(version.derivedFrom) && version.derivedFrom >= 1);
};

/** Validates the exact persisted record shape, including the nested allowlist. */
export const isValidWorkflowAwarenessRecord = (value: unknown): value is WorkflowAwarenessRecord => {
  return isValidWorkflowAwarenessRecordShape(value)
    && isValidWorkflowAwarenessRecordVersion(value)
    && isValidWorkflowAwarenessRecordIdentity(value)
    && isValidWorkflowAwarenessRecordVersions(value)
    && isValidWorkflowAwarenessRecordTimestamps(value);
};

/** Checks the persisted record object and exact top-level key set. */
function isValidWorkflowAwarenessRecordShape(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && sortedKeysEqual(value as Record<string, unknown>, FLAT_RECORD_KEYS);
}

/** Checks the persisted consent and schema versions. */
function isValidWorkflowAwarenessRecordVersion(value: Record<string, unknown>): boolean {
  return value.consentVersion === WORKFLOW_AWARENESS_CONSENT_VERSION
    && value.schemaVersion === WORKFLOW_AWARENESS_SCHEMA_VERSION;
}

/** Checks the required cycle identity and lifecycle status fields. */
function isValidWorkflowAwarenessRecordIdentity(value: Record<string, unknown>): boolean {
  return isNonEmptyString(value.cycleId) && isNonEmptyString(value.workflowId) && isNonEmptyString(value.cycleDate)
    && typeof value.status === 'string' && CYCLE_STATUSES.has(value.status);
}

/** Checks every nested outlook version entry. */
function isValidWorkflowAwarenessRecordVersions(value: Record<string, unknown>): boolean {
  return Array.isArray(value.outlookVersions) && value.outlookVersions.every(isValidOutlookVersion);
}

/** Checks both persisted timestamps. */
function isValidWorkflowAwarenessRecordTimestamps(value: Record<string, unknown>): boolean {
  return isNonEmptyString(value.createdAt) && isNonEmptyString(value.updatedAt);
}

/** Validates the nested Firestore document shape and its metadata allowlist. */
export const isValidWorkflowAwarenessDocument = (value: unknown): value is WorkflowAwarenessDocument => {
  if (!isValidWorkflowAwarenessDocumentShape(value)) return false;
  const document = value as Record<string, unknown>;
  return isValidWorkflowAwarenessDocumentMetadata(document)
    && isValidWorkflowAwarenessRecord({
      ...(document.metadata as Record<string, unknown>),
      consentVersion: document.consentVersion,
      schemaVersion: document.schemaVersion,
    });
};

/** Checks the persisted document envelope and exact top-level key set. */
function isValidWorkflowAwarenessDocumentShape(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && sortedKeysEqual(value as Record<string, unknown>, RECORD_KEYS);
}

/** Checks document versions and the nested metadata object. */
function isValidWorkflowAwarenessDocumentMetadata(value: Record<string, unknown>): boolean {
  return value.consentVersion === WORKFLOW_AWARENESS_CONSENT_VERSION
    && value.schemaVersion === WORKFLOW_AWARENESS_SCHEMA_VERSION
    && typeof value.metadata === 'object' && value.metadata !== null && !Array.isArray(value.metadata);
}

/** Validates the metadata subset before it is wrapped into a Firestore document. */
export const isValidWorkflowAwarenessMetadata = (value: unknown): value is WorkflowAwarenessMetadata => {
  if (!isValidWorkflowAwarenessMetadataShape(value)) return false;
  return isValidWorkflowAwarenessRecord({
    ...(value as Record<string, unknown>),
    consentVersion: WORKFLOW_AWARENESS_CONSENT_VERSION,
    schemaVersion: WORKFLOW_AWARENESS_SCHEMA_VERSION,
  });
};

/** Checks the metadata subset and exact allowed key set. */
function isValidWorkflowAwarenessMetadataShape(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && sortedKeysEqual(value as Record<string, unknown>, METADATA_KEYS);
}

/** Returns the current user's isolated awareness collection. */
const getAwarenessCollection = (userId: string) => {
  if (!db) throw new Error('Firestore is not initialized');
  return collection(db, 'users', userId, AWARENESS_COLLECTION);
};

/** Returns one awareness document reference without accessing cycle documents. */
const getAwarenessDoc = (userId: string, cycleId: string) => doc(getAwarenessCollection(userId), cycleId);

/** Wraps awareness metadata in the persisted Firestore document envelope. */
const toRecord = (metadata: WorkflowAwarenessMetadata): WorkflowAwarenessDocument => ({
  consentVersion: WORKFLOW_AWARENESS_CONSENT_VERSION,
  schemaVersion: WORKFLOW_AWARENESS_SCHEMA_VERSION,
  metadata,
});

/** Separates valid awareness records from malformed documents requiring cleanup. */
const readSnapshotRecords = (snapshot: AwarenessSnapshot): { valid: WorkflowAwarenessRecord[]; malformedIds: string[] } => {
  const valid: WorkflowAwarenessRecord[] = [];
  const malformedIds: string[] = [];
  snapshot.docs.forEach((entry) => {
    const value = entry.data();
    if (isValidWorkflowAwarenessDocument(value)) {
      valid.push({
        ...(value as WorkflowAwarenessDocument).metadata,
        consentVersion: WORKFLOW_AWARENESS_CONSENT_VERSION,
        schemaVersion: WORKFLOW_AWARENESS_SCHEMA_VERSION,
      });
    } else {
      malformedIds.push(entry.id);
    }
  });
  return { valid, malformedIds };
};

/** Serializes awareness writes so saves and deletes cannot overtake each other. */
export class WorkflowAwarenessWriteQueue {
  private tail: Promise<void> = Promise.resolve();

  /** Adds an async operation after all previously queued work. */
  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

/** Creates an isolated serialized write queue for one authenticated user. */
export const createWorkflowAwarenessWriteQueue = (): WorkflowAwarenessWriteQueue => new WorkflowAwarenessWriteQueue();

/** Saves one metadata-only awareness record when consent is current. */
export const saveWorkflowAwareness = async ({
  userId,
  metadata,
  consent,
}: {
  userId: string;
  metadata: WorkflowAwarenessMetadata;
  consent: WorkflowAwarenessConsent;
}): Promise<void> => {
  if (!isCurrentAwarenessConsent(consent)) return;
  if (!isValidWorkflowAwarenessMetadata(metadata)) throw new Error('Invalid workflow awareness metadata');
  await setDoc(getAwarenessDoc(userId, metadata.cycleId), toRecord(metadata));
};

/** Reads only the current user's nested awareness records and removes malformed records from that same path. */
export const listWorkflowAwareness = async ({
  userId,
  consent,
}: {
  userId: string;
  consent: WorkflowAwarenessConsent;
}): Promise<WorkflowAwarenessRecord[]> => {
  if (!isCurrentAwarenessConsent(consent)) return [];
  const snapshot = await getDocs(query(getAwarenessCollection(userId)));
  const { valid, malformedIds } = readSnapshotRecords(snapshot);
  // A malformed record must not hide valid recommendations if its cleanup is
  // temporarily unavailable; the next refresh will retry the deletion.
  await Promise.allSettled(malformedIds.map((cycleId) => deleteDoc(getAwarenessDoc(userId, cycleId))));
  return valid;
};

/** Deletes every awareness record for the current user; never touches full cloud-cycle documents. */
export const deleteWorkflowAwareness = async (userId: string): Promise<void> => {
  const snapshot = await getDocs(query(getAwarenessCollection(userId)));
  await Promise.all(snapshot.docs.map((entry) => removeDoc(getAwarenessDoc(userId, entry.id))));
};

/** Deletes one cycle-scoped awareness record for the current user. */
export const deleteOneWorkflowAwareness = async (userId: string, cycleId: string): Promise<void> => {
  await deleteDoc(getAwarenessDoc(userId, cycleId));
};

/** Exposes the exact fields used by the dashboard rules handoff for tests and review tooling. */
export const getWorkflowAwarenessAllowlist = (): readonly string[] => RECORD_KEYS;
/** Returns the exact metadata fields allowed in persisted awareness records. */
export const getWorkflowAwarenessMetadataAllowlist = (): readonly string[] => METADATA_KEYS;
