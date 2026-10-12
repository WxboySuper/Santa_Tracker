import {
  DATASET_ADVENT,
  DATASET_SANTA_ROUTE,
  DATASET_TRIAL_ROUTE,
  type VersionedSnapshotStore,
} from "./types";
import { mirrorLegacyDataFile } from "./index";

export async function persistSantaRoute(store: VersionedSnapshotStore, body: string): Promise<void> {
  const version = await store.saveNewVersion(DATASET_SANTA_ROUTE, body);
  await store.activateVersion(DATASET_SANTA_ROUTE, version.versionId);
  await mirrorLegacyDataFile("santa_route.json", body);
}

export async function persistAdventCalendar(store: VersionedSnapshotStore, body: string): Promise<void> {
  const version = await store.saveNewVersion(DATASET_ADVENT, body);
  await store.activateVersion(DATASET_ADVENT, version.versionId);
  await mirrorLegacyDataFile("advent_calendar.json", body);
}

export async function persistTrialRoute(store: VersionedSnapshotStore, body: string): Promise<void> {
  const version = await store.saveNewVersion(DATASET_TRIAL_ROUTE, body);
  await store.activateVersion(DATASET_TRIAL_ROUTE, version.versionId);
  await mirrorLegacyDataFile("trial_route.json", body);
}

export async function removeTrialRoute(store: VersionedSnapshotStore): Promise<boolean> {
  const removed = await store.deleteDataset(DATASET_TRIAL_ROUTE);
  if (process.env.SANTA_STORAGE_BACKEND === "r2") return removed;
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { getDataRoot } = await import("../config");
  const trialPath = path.join(getDataRoot(), "trial_route.json");
  await fs.unlink(trialPath).catch(() => undefined);
  return removed;
}

export async function ensureStoreBootstrapped(store: VersionedSnapshotStore): Promise<void> {
  if (process.env.SANTA_STORAGE_BACKEND === "r2") return;
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { getDataRoot } = await import("../config");

  async function bootstrap(dataset: string, filename: string): Promise<void> {
    const active = await store.readActive(dataset);
    if (active) return;
    const legacyPath = path.join(getDataRoot(), filename);
    try {
      const body = await fs.readFile(legacyPath, "utf-8");
      const version = await store.saveNewVersion(dataset, body);
      await store.activateVersion(dataset, version.versionId);
    } catch {
      // no legacy file yet
    }
  }

  await bootstrap(DATASET_SANTA_ROUTE, "santa_route.json");
  await bootstrap(DATASET_ADVENT, "advent_calendar.json");
}
