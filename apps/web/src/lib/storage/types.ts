export interface SnapshotVersion {
  versionId: string;
  createdAt: string;
}

export interface ActivePointer {
  versionId: string;
  updatedAt: string;
}

/** Versioned JSON blobs (Santa route, advent calendar, trial route). */
export interface VersionedSnapshotStore {
  readActive(dataset: string): Promise<string | null>;
  readActiveVersion(dataset: string): Promise<ActivePointer | null>;
  readVersion(dataset: string, versionId: string): Promise<string | null>;
  saveNewVersion(dataset: string, body: string): Promise<SnapshotVersion>;
  activateVersion(dataset: string, versionId: string): Promise<void>;
  rollback(dataset: string): Promise<SnapshotVersion>;
  listVersions(dataset: string): Promise<SnapshotVersion[]>;
  deleteDataset(dataset: string): Promise<boolean>;
}

export const DATASET_SANTA_ROUTE = "santa-route";
export const DATASET_ADVENT = "advent-calendar";
export const DATASET_TRIAL_ROUTE = "trial-route";
