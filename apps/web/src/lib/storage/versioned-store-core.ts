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
  return {
    async readActive(dataset) {
      const pointerRaw = await backend.read(activeKey(dataset));
      if (!pointerRaw) return null;
      let pointer: ActivePointer;
      try {
        pointer = JSON.parse(pointerRaw) as ActivePointer;
      } catch {
        return null;
      }
      return backend.read(versionKey(dataset, pointer.versionId));
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
      return { versionId: previousId, createdAt: previousId };
    },

    async listVersions(dataset) {
      const keys = await backend.list(versionsPrefix(dataset));
      return keys
        .map(k => k.slice(versionsPrefix(dataset).length).replace(/\.json$/, ""))
        .filter(Boolean)
        .sort()
        .reverse()
        .map(versionId => ({ versionId, createdAt: versionId.split("-")[0] ?? versionId }));
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
