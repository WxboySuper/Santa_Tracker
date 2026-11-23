import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFilesystemBackend } from "./filesystem-backend";
import { createVersionedSnapshotStore } from "./versioned-store-core";
import { DATASET_SANTA_ROUTE } from "./types";
import { LegacyRouteFixtureSchema } from "../../../../../packages/contracts/src/schemas";
import { createLocationFromPayload, loadSantaRouteFromJson, saveSantaRouteToJson } from "../locations";
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
      route: [{ ...backup.route[0], longitude: 202.51, priority: 2, is_stop: false, stop_duration: 10 }],
    }) });
    const wrappedDocument = backupToRouteDocument(wrapped) as { route_nodes: { type: string; is_stop: boolean; location: { lng: number }; stop_experience: { duration_seconds: number } }[] };
    expect(wrappedDocument.route_nodes[0]).toMatchObject({ type: "FLYOVER", is_stop: false, location: { lng: -157.49 }, stop_experience: { duration_seconds: 0 } });
    const fullCircle = parseRouteBackupExport({ raw: JSON.stringify({
      ...backup,
      route: [{ ...backup.route[0], longitude: 360 }],
    }) });
    expect(fullCircle.route[0]?.longitude).toBe(0);
    await expect(loadSantaRouteFromJson(wrappedDocument)).resolves.toMatchObject([{
      longitude: -157.49, is_stop: false, stop_duration: 0, population: 123,
      notes: "Independent note", fun_facts: "Separate fact",
    }]);
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, total_locations: 2 }) })).toThrow("must match");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, backup_timestamp: "not-a-date" }) })).toThrow("valid ISO timestamp");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], latitude: 91 }] }) })).toThrow("invalid latitude");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], stop_duration: -1 }] }) })).toThrow("invalid stop_duration");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], priority: 0 }] }) })).toThrow("invalid priority");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], priority: 4 }] }) })).toThrow("invalid priority");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], longitude: 361 }] }) })).toThrow("invalid longitude");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], arrival_time: "tomorrow" }] }) })).toThrow("invalid arrival_time");
    expect(() => parseRouteBackupExport({ raw: JSON.stringify({ ...backup, route: [{ ...backup.route[0], population: 1.5 }] }) })).toThrow("invalid population");
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
    await expect(loadSantaRouteFromJson(JSON.parse(active ?? "{}"))).resolves.toMatchObject([{
      population: 123, notes: "Independent note", fun_facts: "Separate fact", is_stop: true,
    }]);
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

  it("preserves is_stop on modern-node and legacy-flat read/write round trips", async () => {
    const parent = await tempDir();
    const modernPath = path.join(parent, "modern.json");
    const legacyPath = path.join(parent, "legacy.json");
    const modernNode = {
      id: "flyover-modern", type: "DELIVERY", is_stop: false,
      location: { name: "Modern", lat: 1, lng: 2, timezone_offset: 0 },
      schedule: {}, stop_experience: { duration_seconds: 0 },
      notes: "Keep this note", fun_facts: null,
    };
    await saveSantaRouteToJson([modernNode], modernPath);
    const modernRead = await loadSantaRouteFromJson(modernPath);
    expect(modernRead[0]).toMatchObject({ is_stop: false, notes: "Keep this note", fun_facts: null });
    await saveSantaRouteToJson(modernRead, modernPath);
    await expect(loadSantaRouteFromJson(modernPath)).resolves.toMatchObject([{
      is_stop: false, notes: "Keep this note", fun_facts: null,
    }]);

    await fs.writeFile(legacyPath, JSON.stringify({ route: [{
      name: "Legacy", latitude: 1, longitude: 2, utc_offset: 0, is_stop: false,
      notes: "Legacy note", fun_facts: "Legacy fact", type: "DELIVERY",
    }] }));
    const legacyRead = await loadSantaRouteFromJson(legacyPath);
    expect(legacyRead[0]?.is_stop).toBe(false);
    await saveSantaRouteToJson(legacyRead, legacyPath);
    const legacySaved = JSON.parse(await fs.readFile(legacyPath, "utf8")) as { route: { is_stop: boolean; notes: string; fun_facts: string }[] };
    expect(legacySaved.route[0]).toMatchObject({ is_stop: false, notes: "Legacy note", fun_facts: "Legacy fact" });
    await expect(loadSantaRouteFromJson(legacyPath)).resolves.toMatchObject([{
      is_stop: false, notes: "Legacy note", fun_facts: "Legacy fact",
    }]);

    const clearedFactPath = path.join(parent, "cleared-fact.json");
    await fs.writeFile(clearedFactPath, JSON.stringify({ route: [{
      name: "Cleared fact", latitude: 1, longitude: 2, utc_offset: 0, notes: "Keep note", fun_facts: null,
    }] }));
    const clearedFact = await loadSantaRouteFromJson(clearedFactPath);
    expect(clearedFact[0]?.fun_facts).toBeNull();
    await saveSantaRouteToJson(clearedFact, clearedFactPath);
    await expect(loadSantaRouteFromJson(clearedFactPath)).resolves.toMatchObject([{
      notes: "Keep note", fun_facts: null,
    }]);

    const flyoverPath = path.join(parent, "flyover.json");
    await fs.writeFile(flyoverPath, JSON.stringify({ route_nodes: [{
      id: "flyover-default", type: "FLYOVER", location: { name: "Flyover", lat: 1, lng: 2 },
    }] }));
    await expect(loadSantaRouteFromJson(flyoverPath)).resolves.toMatchObject([{ is_stop: false }]);

    const created = createLocationFromPayload({
      name: "Created", latitude: 1, longitude: 2, utc_offset: 0, notes: "A", fun_facts: "B",
    });
    expect(created).toMatchObject({ notes: "A", fun_facts: "B" });
  });
});
