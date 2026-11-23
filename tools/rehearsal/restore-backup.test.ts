import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFilesystemBackend } from "../../apps/web/src/lib/storage/filesystem-backend";
import { createVersionedSnapshotStore } from "../../apps/web/src/lib/storage/versioned-store-core";
import { DATASET_SANTA_ROUTE } from "../../apps/web/src/lib/storage/types";
import { backupToRouteDocument, parseRouteBackupExport, restoreBackupFile } from "./restore-backup";

const roots: string[] = [];
async function tempDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "santa-backup-restore-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

const backup = {
  backup_timestamp: "2026-11-23T19:00:00.000Z",
  total_locations: 1,
  route: [{
    name: "North Pole", latitude: 90, longitude: 0, utc_offset: 0,
    arrival_time: "2026-12-24T10:00:00.000Z", departure_time: "2026-12-24T10:01:00.000Z",
    country: null, population: null, priority: 1, notes: "Test note", fun_facts: "Test note", stop_duration: 1, is_stop: true,
  }],
};

describe("local filesystem backup restore", () => {
  it("validates the export and converts it into a route snapshot", () => {
    const parsed = parseRouteBackupExport(JSON.stringify(backup));
    const document = backupToRouteDocument(parsed) as { route_nodes: { location: { name: string; lat: number; lng: number }; stop_experience: { duration_seconds: number } }[] };
    expect(document.route_nodes[0]?.location).toMatchObject({ name: "North Pole", lat: 90, lng: 0 });
    expect(document.route_nodes[0]?.stop_experience.duration_seconds).toBe(60);
    expect(() => parseRouteBackupExport(JSON.stringify({ ...backup, total_locations: 2 }))).toThrow("must match");
    expect(() => parseRouteBackupExport(JSON.stringify({ ...backup, route: [{ ...backup.route[0], latitude: 91 }] }))).toThrow("invalid latitude");
  });

  it("writes and activates one version in an empty filesystem directory", async () => {
    const parent = await tempDir();
    const input = path.join(parent, "export.json");
    const dataDir = path.join(parent, "restored-data");
    await fs.writeFile(input, JSON.stringify(backup));
    const restored = await restoreBackupFile(input, dataDir);
    const store = createVersionedSnapshotStore(createFilesystemBackend(dataDir));
    const active = await store.readActive(DATASET_SANTA_ROUTE);
    expect(restored.locationCount).toBe(1);
    expect(restored.versionId).toBe((await store.readActiveVersion(DATASET_SANTA_ROUTE))?.versionId);
    expect(JSON.parse(active ?? "{}")).toEqual(backupToRouteDocument(backup));
  });

  it("refuses to overwrite an active route", async () => {
    const parent = await tempDir();
    const input = path.join(parent, "export.json");
    const dataDir = path.join(parent, "restored-data");
    await fs.writeFile(input, JSON.stringify(backup));
    const store = createVersionedSnapshotStore(createFilesystemBackend(dataDir));
    const existing = await store.saveNewVersion(DATASET_SANTA_ROUTE, "{} ");
    await store.activateVersion(DATASET_SANTA_ROUTE, existing.versionId);
    await expect(restoreBackupFile(input, dataDir)).rejects.toThrow("empty local data directory");
  });
});
