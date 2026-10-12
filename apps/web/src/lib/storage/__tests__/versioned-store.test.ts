import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFilesystemBackend } from "../filesystem-backend";
import { createVersionedSnapshotStore } from "../versioned-store-core";

describe("versioned snapshot store", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "santa-store-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("saves, activates, reads, and rolls back versions", async () => {
    const store = createVersionedSnapshotStore(createFilesystemBackend(root));
    const first = await store.saveNewVersion("santa-route", JSON.stringify({ v: 1 }));
    await store.activateVersion("santa-route", first.versionId);
    const activeAfterFirst = await store.readActive("santa-route");
    expect(activeAfterFirst).toBe(JSON.stringify({ v: 1 }));

    const second = await store.saveNewVersion("santa-route", JSON.stringify({ v: 2 }));
    await store.activateVersion("santa-route", second.versionId);
    const activeAfterSecond = await store.readActive("santa-route");
    expect(activeAfterSecond).toBe(JSON.stringify({ v: 2 }));

    const rolled = await store.rollback("santa-route");
    expect(rolled.versionId).toBe(first.versionId);
    const activeAfterRollback = await store.readActive("santa-route");
    expect(activeAfterRollback).toBe(JSON.stringify({ v: 1 }));
  });

  it("lists versions newest-first", async () => {
    const store = createVersionedSnapshotStore(createFilesystemBackend(root));
    const firstVersion = await store.saveNewVersion("advent-calendar", "{}");
    const secondVersion = await store.saveNewVersion("advent-calendar", "{}");
    await store.activateVersion("advent-calendar", secondVersion.versionId);
    const versions = await store.listVersions("advent-calendar");
    expect(versions).toHaveLength(2);
    expect(versions.map(version => version.versionId)).toEqual(
      expect.arrayContaining([firstVersion.versionId, secondVersion.versionId]),
    );
    expect(Date.parse(versions[0]?.createdAt ?? "")).toBeGreaterThanOrEqual(
      Date.parse(versions[1]?.createdAt ?? ""),
    );
  });
});
