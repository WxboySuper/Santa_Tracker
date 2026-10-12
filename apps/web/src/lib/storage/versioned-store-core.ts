import type { ActivePointer, SnapshotVersion, VersionedSnapshotStore } from "./types";

export function makeVersionId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface VersionedStoreBackend {
  read(key: string): Promise<string | null>;
  write(key: string, body: string): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
}

function activeKey(dataset: string): string {
  return `${dataset}/active.json`;
}

function versionKey(dataset: string, versionId: string): string {
  return `${dataset}/versions/${versionId}.json`;
}

function versionsPrefix(dataset: string): string {
  return `${dataset}/versions/`;
}

export function createVersionedSnapshotStore(backend: VersionedStoreBackend): VersionedSnapshotStore {
  async function readPointer(dataset: string): Promise<ActivePointer | null> {
    const pointerRaw = await backend.read(activeKey(dataset));
    if (!pointerRaw) return null;
    try {
      return JSON.parse(pointerRaw) as ActivePointer;
    } catch {
      return null;
    }
  }

  function createdAtFromVersionId(versionId: string): string {
    const match = versionId.match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z-/);
    return match ? `${match[1]}:${match[2]}:${match[3]}.${match[4]}Z` : versionId;
  }

  return {
    async readActive(dataset) {
      const pointer = await readPointer(dataset);
      return pointer ? backend.read(versionKey(dataset, pointer.versionId)) : null;
    },

    async readActiveVersion(dataset) {
      return readPointer(dataset);
    },

    async readVersion(dataset, versionId) {
      return backend.read(versionKey(dataset, versionId));
    },

    async saveNewVersion(dataset, body) {
      const version: SnapshotVersion = { versionId: makeVersionId(), createdAt: new Date().toISOString() };
      await backend.write(versionKey(dataset, version.versionId), body);
      return version;
    },

    async activateVersion(dataset, versionId) {
      const exists = await backend.read(versionKey(dataset, versionId));
      if (!exists) throw new Error(`Unknown version ${versionId} for ${dataset}`);
      const pointer: ActivePointer = { versionId, updatedAt: new Date().toISOString() };
      await backend.write(activeKey(dataset), JSON.stringify(pointer, null, 2));
    },

    async rollback(dataset) {
      const pointerRaw = await backend.read(activeKey(dataset));
      if (!pointerRaw) throw new Error(`No active version for ${dataset}`);
      const current = JSON.parse(pointerRaw) as ActivePointer;
      const keys = await backend.list(versionsPrefix(dataset));
      const versionIds = keys
        .map(k => k.slice(versionsPrefix(dataset).length).replace(/\.json$/, ""))
        .filter(Boolean)
        .sort()
        .reverse();
      const idx = versionIds.indexOf(current.versionId);
      const previousId = idx >= 0 ? versionIds[idx + 1] : versionIds[1];
      if (!previousId) throw new Error(`No prior version to roll back for ${dataset}`);
      await this.activateVersion(dataset, previousId);
      return { versionId: previousId, createdAt: createdAtFromVersionId(previousId) };
    },

    async listVersions(dataset) {
      const keys = await backend.list(versionsPrefix(dataset));
      return keys
        .map(k => k.slice(versionsPrefix(dataset).length).replace(/\.json$/, ""))
        .filter(Boolean)
        .sort()
        .reverse()
        .map(versionId => ({ versionId, createdAt: createdAtFromVersionId(versionId) }));
    },

    async deleteDataset(dataset) {
      const keys = await backend.list(`${dataset}/`);
      let removed = false;
      for (const key of keys) {
        removed = (await backend.delete(key)) || removed;
      }
      removed = (await backend.delete(activeKey(dataset))) || removed;
      const versionKeys = await backend.list(versionsPrefix(dataset));
      for (const key of versionKeys) {
        removed = (await backend.delete(key)) || removed;
      }
      return removed;
    },
  };
}
