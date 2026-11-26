export interface SnapshotVersion {
  versionId: string;
  createdAt: string;
}

export interface ActivationAuditEntry {
  action: "activate" | "rollback";
  versionId: string;
  previousVersionId: string | null;
  actor: string;
  at: string;
  reason: string;
  checksum: string;
}

export interface ActivePointer {
  versionId: string;
  updatedAt: string;
  audit?: ActivationAuditEntry[];
}

/** Versioned JSON blobs (Santa route, advent calendar, trial route). */
export interface VersionedSnapshotStore {
  readActive(dataset: string): Promise<string | null>;
  readActiveVersion(dataset: string): Promise<ActivePointer | null>;
  readVersion(dataset: string, versionId: string): Promise<string | null>;
  saveNewVersion(dataset: string, body: string): Promise<SnapshotVersion>;
  activateVersion(dataset: string, versionId: string, audit?: Omit<ActivationAuditEntry, "versionId" | "previousVersionId" | "at" | "action">): Promise<void>;
  rollback(dataset: string, audit?: Omit<ActivationAuditEntry, "versionId" | "previousVersionId" | "at" | "action">): Promise<SnapshotVersion>;
  listVersions(dataset: string): Promise<SnapshotVersion[]>;
  deleteDataset(dataset: string): Promise<boolean>;
}

export const DATASET_SANTA_ROUTE = "santa-route";
export const DATASET_ADVENT = "advent-calendar";
export const DATASET_TRIAL_ROUTE = "trial-route";
