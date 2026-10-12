import { getDataRoot } from "../config";
import { createFilesystemBackend } from "./filesystem-backend";
import { createR2Backend, type R2BucketLike } from "./r2-backend";
import { createVersionedSnapshotStore } from "./versioned-store-core";
import type { VersionedSnapshotStore } from "./types";

let cachedStore: VersionedSnapshotStore | null = null;

export function getSnapshotStore(bucket?: R2BucketLike | null): VersionedSnapshotStore {
  if (bucket) {
    return createVersionedSnapshotStore(createR2Backend(bucket));
  }
  if (process.env.SANTA_STORAGE_BACKEND === "r2") {
    throw new Error("SANTA_SNAPSHOTS binding is required when SANTA_STORAGE_BACKEND=r2");
  }
  if (cachedStore) return cachedStore;
  cachedStore = createVersionedSnapshotStore(createFilesystemBackend(getDataRoot()));
  return cachedStore;
}

export function resetSnapshotStoreForTests(): void {
  cachedStore = null;
}

export async function mirrorLegacyDataFile(filename: string, body: string): Promise<void> {
  if (process.env.SANTA_STORAGE_BACKEND === "r2") return;
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const legacyPath = path.join(getDataRoot(), filename);
  await fs.mkdir(path.dirname(legacyPath), { recursive: true });
  const tmp = `${legacyPath}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, body, "utf-8");
  await fs.rename(tmp, legacyPath);
}
