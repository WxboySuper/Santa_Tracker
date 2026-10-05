import {
  DATASET_ADVENT,
  DATASET_SANTA_ROUTE,
  DATASET_TRIAL_ROUTE,
  type VersionedSnapshotStore,
} from "./types";
import { mirrorLegacyDataFile, mirrorPublicDataFile } from "./index";

export async function persistSantaRoute(store: VersionedSnapshotStore, body: string): Promise<void> {
  const version = await store.saveNewVersion(DATASET_SANTA_ROUTE, body);
  await store.activateVersion(DATASET_SANTA_ROUTE, version.versionId);
  await mirrorLegacyDataFile("santa_route.json", body);
  await mirrorPublicDataFile("santa_route.json", body);
}

export async function persistAdventCalendar(store: VersionedSnapshotStore, body: string): Promise<void> {
  const version = await store.saveNewVersion(DATASET_ADVENT, body);
  await store.activateVersion(DATASET_ADVENT, version.versionId);
  await mirrorLegacyDataFile("advent_calendar.json", body);
  await mirrorPublicDataFile("advent_calendar.json", body);
}

export async function persistTrialRoute(store: VersionedSnapshotStore, body: string): Promise<void> {
  const version = await store.saveNewVersion(DATASET_TRIAL_ROUTE, body);
  await store.activateVersion(DATASET_TRIAL_ROUTE, version.versionId);
  await mirrorLegacyDataFile("trial_route.json", body);
}

export async function removeTrialRoute(store: VersionedSnapshotStore): Promise<boolean> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { getDataRoot } = await import("../config");
  const removed = await store.deleteDataset(DATASET_TRIAL_ROUTE);
  const trialPath = path.join(getDataRoot(), "trial_route.json");
  await fs.unlink(trialPath).catch(() => undefined);
  return removed;
}

export async function ensureStoreBootstrapped(store: VersionedSnapshotStore): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { getDataRoot } = await import("../config");

  async function bootstrap(dataset: string, filename: string, mirrorPublic: boolean): Promise<void> {
    const active = await store.readActive(dataset);
    if (active) return;
    const legacyPath = path.join(getDataRoot(), filename);
    try {
      const body = await fs.readFile(legacyPath, "utf-8");
      const version = await store.saveNewVersion(dataset, body);
      await store.activateVersion(dataset, version.versionId);
      if (mirrorPublic) await mirrorPublicDataFile(filename, body);
    } catch {
      // no legacy file yet
    }
  }

  await bootstrap(DATASET_SANTA_ROUTE, "santa_route.json", true);
  await bootstrap(DATASET_ADVENT, "advent_calendar.json", true);
}
