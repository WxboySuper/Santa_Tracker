import { GFCForecastSaveData } from './outlooks';
import type { CycleMetadata } from './workflow';

/**
 * Cloud-backed cycle metadata stored in Firestore
 * Exposed separately in app code even though the current Firestore document also stores payloadJson.
 */
export interface CloudCycleMetadata {
  id: string;
  userId: string;
  label: string;
  cycleDate: string;
  createdAt: string;
  updatedAt: string;
  forecastDays: number;
  totalOutlooks: number;
  totalFeatures: number;
  /** Indicates whether the user can modify this cycle (false when premium has expired) */
  isReadOnly: boolean;
  /** Content hash to detect remote changes */
  payloadHash?: string;
}

/**
 * Full cloud cycle including both metadata and serialized payload
 */
export interface CloudCycle extends CloudCycleMetadata {
  payload: GFCForecastSaveData;
  /** v2 workflow metadata for the cycle (optional, present for workflow-imported cycles). */
  workflowMetadata?: CycleMetadata;
}

/**
 * Cloud sync state for UI display
 */
export type CloudSyncState = 'idle' | 'saving' | 'saved' | 'error' | 'offline' | 'newer-remote' | 'loading';

/**
 * Cloud cycle context for the currently opened cloud cycle
 */
export interface CloudCycleContext {
  id: string;
  label: string;
  syncState: CloudSyncState;
  lastSyncError?: string;
  newerVersionAvailable?: boolean;
}

/**
 * Response from cloud operations
 */
export interface CloudOperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}
