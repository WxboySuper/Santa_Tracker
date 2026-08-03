import { MAX_OUTLOOK_VERSIONS } from '../lib/workflowMetadataContract';
import type { CycleMetadata, CycleStatus, OutlookStatus } from './workflow';

/** Version of the opt-in awareness consent contract stored beside each record. */
export const WORKFLOW_AWARENESS_CONSENT_VERSION = 1 as const;

/** Version of the metadata-only Firestore document shape. */
export const WORKFLOW_AWARENESS_SCHEMA_VERSION = 1 as const;

export interface WorkflowAwarenessConsent {
  enabled: boolean;
  version: number;
}

export interface WorkflowAwarenessOutlookVersion {
  version: number;
  status: OutlookStatus;
  derivedFrom?: number;
  createdAt: string;
}

/** The complete allowlisted payload written to Firestore; no forecast content is represented here. */
export interface WorkflowAwarenessMetadata {
  cycleId: string;
  workflowId: string;
  cycleDate: string;
  status: CycleStatus;
  outlookVersions: WorkflowAwarenessOutlookVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAwarenessRecord extends WorkflowAwarenessMetadata {
  consentVersion: typeof WORKFLOW_AWARENESS_CONSENT_VERSION;
  schemaVersion: typeof WORKFLOW_AWARENESS_SCHEMA_VERSION;
}

/** Firestore document shape; metadata is nested so dashboard rules can enforce its exact allowlist. */
export interface WorkflowAwarenessDocument {
  consentVersion: typeof WORKFLOW_AWARENESS_CONSENT_VERSION;
  schemaVersion: typeof WORKFLOW_AWARENESS_SCHEMA_VERSION;
  metadata: WorkflowAwarenessMetadata;
}

/** A Home recommendation derived only from metadata records. */
export interface WorkflowAwarenessRecommendation extends WorkflowAwarenessMetadata {
  reason: 'in-progress-cycle';
}

/** Clamps workflow version numbers to the Firestore awareness contract. */
const clampAwarenessVersionNumber = (version: number): number =>
  Math.min(Math.max(version, 1), MAX_OUTLOOK_VERSIONS);

/** Projects full cycle metadata into the privacy-safe awareness allowlist. */
export const createAwarenessMetadata = (metadata: CycleMetadata): WorkflowAwarenessMetadata => ({
  cycleId: metadata.id,
  workflowId: metadata.workflowId,
  cycleDate: metadata.cycleDate,
  status: metadata.status,
  outlookVersions: metadata.outlookVersions
    .slice(-MAX_OUTLOOK_VERSIONS)
    .map(({ version, status, derivedFrom, createdAt }) => {
      const boundedVersion = clampAwarenessVersionNumber(version);
      const boundedDerivedFrom = derivedFrom === undefined
        ? undefined
        : clampAwarenessVersionNumber(derivedFrom);

      return {
        version: boundedVersion,
        status,
        ...(boundedDerivedFrom === undefined ? {} : { derivedFrom: boundedDerivedFrom }),
        createdAt,
      };
    }),
  createdAt: metadata.createdAt,
  updatedAt: metadata.updatedAt,
});

/** Returns true only for the currently supported enabled consent version. */
export const isCurrentAwarenessConsent = (
  consent: WorkflowAwarenessConsent | undefined,
): consent is WorkflowAwarenessConsent & { version: typeof WORKFLOW_AWARENESS_CONSENT_VERSION } =>
  Boolean(consent?.enabled && consent.version === WORKFLOW_AWARENESS_CONSENT_VERSION);

/** Completed records remain available for history, but never drive a resume recommendation. */
export const getAwarenessRecommendations = (
  records: WorkflowAwarenessMetadata[],
): WorkflowAwarenessRecommendation[] => records
  .filter((record) => record.status === 'in-progress')
  .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
  .map((record) => ({ ...record, reason: 'in-progress-cycle' as const }));
