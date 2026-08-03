import type { CycleMetadata, CycleStatus, OutlookStatus, OutlookVersion } from '../types/workflow';

/** Firestore's bounded nested metadata contract for one workflow cycle. */
export const MAX_OUTLOOK_VERSIONS = 32;

const CYCLE_STATUSES: readonly CycleStatus[] = [
  'in-progress',
  'completed',
  'completed-with-omissions',
];

const OUTLOOK_STATUSES: readonly OutlookStatus[] = [
  'in-progress',
  'completed',
  'skipped',
  'omitted',
];

/** Narrows unknown input to a non-array object record. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Ensures a contract object contains only its required and optional keys. */
const hasExactKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => key in value) && keys.every((key) => allowed.has(key));
};

/** Returns true for a bounded, non-empty workflow version number. */
const isValidVersionNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_OUTLOOK_VERSIONS;

/** Returns true for a supported non-empty status value. */
const isSupportedStatus = <T extends string>(value: unknown, statuses: readonly T[]): value is T =>
  typeof value === 'string' && statuses.includes(value as T);

/** Returns true for a non-empty persisted timestamp or identifier. */
const isNonEmptyText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** Validates one nested outlook version without accepting payload or UI fields. */
export const isMetadataOnlyOutlookVersion = (value: unknown): value is OutlookVersion => {
  return isMetadataOnlyOutlookVersionShape(value)
    && isValidVersionNumber(value.version)
    && isSupportedStatus(value.status, OUTLOOK_STATUSES)
    && isNonEmptyText(value.createdAt)
    && isValidDerivedFrom(value);
};

/** Checks the allowed keys for one metadata-only outlook version. */
function isMetadataOnlyOutlookVersionShape(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && hasExactKeys(value, ['version', 'status', 'createdAt'], ['derivedFrom']);
}

/** Checks the optional source version reference. */
function isValidDerivedFrom(value: Record<string, unknown>): boolean {
  return !('derivedFrom' in value) || isValidVersionNumber(value.derivedFrom);
}

/** Clamps workflow version numbers to the Firestore persistence contract. */
const clampWorkflowVersionNumber = (version: number): number =>
  Math.min(Math.max(version, 1), MAX_OUTLOOK_VERSIONS);

/** Projects workflow metadata into the bounded shape accepted by Firestore rules. */
export const boundWorkflowMetadataForPersistence = (metadata: CycleMetadata): CycleMetadata => ({
  ...metadata,
  outlookVersions: metadata.outlookVersions
    .slice(-MAX_OUTLOOK_VERSIONS)
    .map(({ version, status, derivedFrom, createdAt }) => {
      const boundedVersion = clampWorkflowVersionNumber(version);
      const boundedDerivedFrom = derivedFrom === undefined
        ? undefined
        : clampWorkflowVersionNumber(derivedFrom);

      return {
        version: boundedVersion,
        status,
        ...(boundedDerivedFrom === undefined ? {} : { derivedFrom: boundedDerivedFrom }),
        createdAt,
      };
    }),
});

/** Validates the exact workflow metadata object persisted inside a cloud cycle. */
export const isValidWorkflowMetadata = (value: unknown): value is CycleMetadata => {
  return isWorkflowMetadataShape(value)
    && isWorkflowMetadataIdentity(value)
    && isWorkflowMetadataOutlookVersions(value)
    && isWorkflowMetadataTimestamps(value);
};

/** Checks the required workflow metadata keys. */
function isWorkflowMetadataShape(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && hasExactKeys(value, [
    'id', 'workflowId', 'cycleDate', 'status', 'outlookVersions', 'createdAt', 'updatedAt',
  ]);
}

/** Checks workflow identity and lifecycle status fields. */
function isWorkflowMetadataIdentity(value: Record<string, unknown>): boolean {
  return isNonEmptyText(value.id)
    && isNonEmptyText(value.workflowId)
    && isNonEmptyText(value.cycleDate)
    && isSupportedStatus(value.status, CYCLE_STATUSES);
}

/** Checks the bounded list of nested outlook versions. */
function isWorkflowMetadataOutlookVersions(value: Record<string, unknown>): boolean {
  return Array.isArray(value.outlookVersions)
    && value.outlookVersions.length <= MAX_OUTLOOK_VERSIONS
    && value.outlookVersions.every(isMetadataOnlyOutlookVersion);
}

/** Checks workflow creation and update timestamps. */
function isWorkflowMetadataTimestamps(value: Record<string, unknown>): boolean {
  return isNonEmptyText(value.createdAt) && isNonEmptyText(value.updatedAt);
}
