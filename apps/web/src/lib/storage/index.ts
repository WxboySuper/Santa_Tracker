import { getDataRoot } from "../config";
import { createFilesystemBackend } from "./filesystem-backend";
import { createR2Backend, type R2BucketLike } from "./r2-backend";
import { createVersionedSnapshotStore } from "./versioned-store-core";
import type { VersionedSnapshotStore } from "./types";

export interface KeyValueStore {
  read(key: string): Promise<string | null>;
  write(key: string, body: string): Promise<void>;
}

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

/** Raw keys share the configured backend without using dataset activation pointers. */
export function getKeyValueStore(bucket?: R2BucketLike | null): KeyValueStore {
  const backend = bucket
    ? createR2Backend(bucket)
    : process.env.SANTA_STORAGE_BACKEND === "r2"
      ? missingR2Backend()
      : createFilesystemBackend(getDataRoot());
  return { read: key => backend.read(key), write: (key, body) => backend.write(key, body) };
}

function missingR2Backend(): never {
  throw new Error("SANTA_SNAPSHOTS binding is required when SANTA_STORAGE_BACKEND=r2");
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
