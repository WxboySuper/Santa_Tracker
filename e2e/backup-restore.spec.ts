import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect, getRuntimeConfig, test } from "./fixtures";
import { createFilesystemBackend } from "../apps/web/src/lib/storage/filesystem-backend";
import { createVersionedSnapshotStore } from "../apps/web/src/lib/storage/versioned-store-core";
import { DATASET_SANTA_ROUTE } from "../apps/web/src/lib/storage/types";
import { backupToRouteDocument, restoreBackupFile, type RouteBackupExport } from "../tools/rehearsal/restore-backup";

test("local backup export, snapshot rollback, and clean-directory restore preserve route data", async ({ page }) => {
  const runtimeFile = process.env.E2E_RUNTIME_FILE;
  if (!runtimeFile) throw new Error("E2E_RUNTIME_FILE is not configured");
  const password = (await getRuntimeConfig(runtimeFile)).adminPassword;
  expect((await page.request.post("/api/admin/login", { data: { password } })).status()).toBe(200);

  const response = await page.request.get("/api/admin/backup/export");
  expect(response.status()).toBe(200);
  const backup = await response.json() as RouteBackupExport;
  expect(backup.route.length).toBeGreaterThan(1);
  expect(backup.total_locations).toBe(backup.route.length);

  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "santa-recovery-drill-"));
  const source = path.join(parent, "backup-export.json");
  const versionedData = path.join(parent, "versioned-data");
  const cleanRestoreData = path.join(parent, "clean-restore-data");
  await fs.writeFile(source, JSON.stringify(backup));
  try {
    const versionedStore = createVersionedSnapshotStore(createFilesystemBackend(versionedData));
    const originalSnapshot = JSON.stringify(backupToRouteDocument(backup), null, 2);
    const first = await versionedStore.saveNewVersion(DATASET_SANTA_ROUTE, originalSnapshot);
    await versionedStore.activateVersion(DATASET_SANTA_ROUTE, first.versionId);
    await delay(5);

    const changedDocument = { ...JSON.parse(originalSnapshot) as Record<string, unknown>, meta: { changed: true } };
    const second = await versionedStore.saveNewVersion(DATASET_SANTA_ROUTE, JSON.stringify(changedDocument));
    await versionedStore.activateVersion(DATASET_SANTA_ROUTE, second.versionId);
    expect(await versionedStore.readActive(DATASET_SANTA_ROUTE)).toBe(JSON.stringify(changedDocument));

    const rolledBack = await versionedStore.rollback(DATASET_SANTA_ROUTE);
    expect(rolledBack.versionId).toBe(first.versionId);
    expect(await versionedStore.readActive(DATASET_SANTA_ROUTE)).toBe(originalSnapshot);

    const restored = await restoreBackupFile({ inputPath: source, dataDir: cleanRestoreData });
    const cleanStore = createVersionedSnapshotStore(createFilesystemBackend(cleanRestoreData));
    const restoredSnapshot = await cleanStore.readActive(DATASET_SANTA_ROUTE);
    expect(restored.locationCount).toBe(backup.total_locations);
    expect(restoredSnapshot).not.toBeNull();
    const restoredDocument = JSON.parse(restoredSnapshot ?? "{}") as ReturnType<typeof backupToRouteDocument>;
    expect(restoredDocument).toEqual(backupToRouteDocument(backup));
    const restoredRoute = (restoredDocument.route_nodes as {
      location: { name: string; lat: number; lng: number; timezone_offset?: number | null; region?: string | null };
      schedule: { arrival_utc?: string | null; departure_utc?: string | null };
      stop_experience: { duration_seconds?: number | null };
      population?: number | null;
      notes?: string | null;
      fun_facts?: string | null;
      priority?: number | null;
      is_stop?: boolean | null;
    }[]).map(node => ({
      name: node.location.name,
      latitude: node.location.lat,
      longitude: node.location.lng,
      utc_offset: node.location.timezone_offset ?? 0,
      arrival_time: node.schedule.arrival_utc ?? null,
      departure_time: node.schedule.departure_utc ?? null,
      country: node.location.region ?? null,
      population: node.population ?? null,
      priority: node.priority ?? null,
      notes: node.notes ?? null,
      fun_facts: node.fun_facts ?? node.notes ?? null,
      stop_duration: Math.round((node.stop_experience.duration_seconds ?? 0) / 60),
      is_stop: node.is_stop ?? true,
    }));
    expect(restoredRoute).toEqual(backup.route);
    console.log(`BACKUP_RECOVERY versions=${first.versionId},${second.versionId} rollback=${rolledBack.versionId} restored=${restored.versionId} locations=${restored.locationCount}`);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});
