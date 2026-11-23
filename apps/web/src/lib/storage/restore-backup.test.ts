import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFilesystemBackend } from "./filesystem-backend";
import { createVersionedSnapshotStore } from "./versioned-store-core";
import { DATASET_SANTA_ROUTE } from "./types";
import { LegacyRouteFixtureSchema } from "../../../../../packages/contracts/src/schemas";
import { backupToRouteDocument, parseRouteBackupExport, readOption, restoreBackupFile } from "../../../../../tools/rehearsal/restore-backup";

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
    country: null, population: 123, priority: 1, notes: "Independent note", fun_facts: "Separate fact", stop_duration: 1, is_stop: true,
  }],
};

describe("local filesystem backup restore", () => {
  it("reads both separated and equals-form CLI options", () => {
    expect(readOption({ args: ["--input", "backup.json"], name: "--input" })).toBe("backup.json");
    expect(readOption({ args: ["--input=backup.json"], name: "--input" })).toBe("backup.json");
    expect(() => readOption({ args: ["--input="], name: "--input" })).toThrow("needs a value");
  });

  it("validates the export and converts it into a route snapshot", async () => {
    const parsed = parseRouteBackupExport({ raw: JSON.stringify(backup) });
    const document = backupToRouteDocument(parsed) as { route_nodes: { location: { name: string; lat: number; lng: number }; stop_experience: { duration_seconds: number } }[] };
    expect(document.route_nodes[0]?.location).toMatchObject({ name: "North Pole", lat: 90, lng: 0 });
    expect(document.route_nodes[0]?.stop_experience.duration_seconds).toBe(60);
    expect(document.route_nodes[0]?.location).toMatchObject({ region: "Unknown" });
    expect(LegacyRouteFixtureSchema.safeParse(document).success).toBe(true);
    const priorYear = backupToRouteDocument({ ...parsed, backup_timestamp: "2025-12-24T00:00:00.000Z" }) as { meta: { year: number } };
    expect(priorYear.meta.year).toBe(2025);
    const wrapped = parseRouteBackupExport({ raw: JSON.stringify({
      ...backup,
      route: [{ ...backup.route[0], longitude: 202.51, priority: 2, is_stop: true, stop_duration: 10 }],
    }) });
    const wrappedDocument = backupToRouteDocument(wrapped) as { route_nodes: { type: string; is_stop: boolean; location: { lng: number }; stop_experience: { duration_seconds: number } }[] };
    expect(wrappedDocument.route_nodes[0]).toMatchObject({ type: "DELIVERY", is_stop: true, location: { lng: -157.49 }, stop_experience: { duration_seconds: 600 } });
    const fullCircle = parseRouteBackupExport({ raw: JSON.stringify({
      ...backup,
      route: [{ ...backup.route[0], longitude: 360 }],
    }) });
    expect(fullCircle.route[0]?.longitude).toBe(0);
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, total_locations: 2 }) })).toThrow("must match");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, backup_timestamp: "not-a-date" }) })).toThrow("valid ISO timestamp");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], latitude: 91 }] }) })).toThrow("invalid latitude");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], stop_duration: -1 }] }) })).toThrow("invalid stop_duration");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], priority: 0 }] }) })).toThrow("invalid priority");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], priority: 4 }] }) })).toThrow("invalid priority");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], longitude: 361 }] }) })).toThrow("invalid longitude");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], arrival_time: "tomorrow" }] }) })).toThrow("invalid arrival_time");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], population: 1.5 }] }) })).toThrow("invalid population");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], is_stop: false }] }) })).toThrow("flyovers are not supported by the local restore drill");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], type: "FLYOVER" }] }) })).toThrow("flyovers are not supported by the local restore drill");
  });

  it("writes and activates one version in an empty filesystem directory", async () => {
    const parent = await tempDir();
    const input = path.join(parent, "export.json");
    const dataDir = path.join(parent, "restored-data");
    await fs.writeFile(input, JSON.stringify(backup));
    const restored = await restoreBackupFile({ inputPath: input, dataDir });
    const store = createVersionedSnapshotStore(createFilesystemBackend(dataDir));
    const active = await store.readActive(DATASET_SANTA_ROUTE);
    expect(restored.locationCount).toBe(1);
    expect(restored.versionId).toBe((await store.readActiveVersion(DATASET_SANTA_ROUTE))?.versionId);
    expect(JSON.parse(active ?? "{}")).toEqual(backupToRouteDocument(backup));
    expect(JSON.parse(active ?? "{}").route_nodes[0]).toMatchObject({
      population: 123, notes: "Independent note", fun_facts: "Separate fact", is_stop: true,
    });
  });

  it("rejects schema-invalid route times before creating a version", async () => {
    const parent = await tempDir();
    const input = path.join(parent, "invalid-export.json");
    const dataDir = path.join(parent, "invalid-restore");
    await fs.writeFile(input, JSON.stringify({
      ...backup,
      route: [{ ...backup.route[0], arrival_time: "not-a-date" }],
    }));
    await expect(restoreBackupFile({ inputPath: input, dataDir })).rejects.toThrow("invalid arrival_time");
    await expect(fs.readdir(dataDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses any non-empty target directory, including orphan history and other datasets", async () => {
    const parent = await tempDir();
    const input = path.join(parent, "export.json");
    await fs.writeFile(input, JSON.stringify(backup));
    const orphanDir = path.join(parent, "orphan-history");
    const orphanBackend = createFilesystemBackend(orphanDir);
    await orphanBackend.write("santa-route/versions/orphan.json", "{}");
    await expect(restoreBackupFile({ inputPath: input, dataDir: orphanDir })).rejects.toThrow("non-empty local data directory");

    const otherDatasetDir = path.join(parent, "other-dataset");
    const otherBackend = createFilesystemBackend(otherDatasetDir);
    await otherBackend.write("advent-calendar/active.json", "{}");
    await expect(restoreBackupFile({ inputPath: input, dataDir: otherDatasetDir })).rejects.toThrow("non-empty local data directory");
  });

});
