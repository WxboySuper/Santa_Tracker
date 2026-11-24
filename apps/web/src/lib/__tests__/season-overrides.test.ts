import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFilesystemBackend } from "../storage/filesystem-backend";
import { createSeasonOverrideRepository, MAX_SEASON_OVERRIDE_MS, parseSeasonOverrideState, SEASON_OVERRIDE_KEY } from "../season-overrides";
import type { SeasonModeOverride } from "../season-mode";

const roots: string[] = [];
async function localStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), "season-overrides-"));
  roots.push(root);
  return createFilesystemBackend(root);
}

const validOverride: SeasonModeOverride = {
  mode: "advent",
  setAt: "2026-11-01T00:00:00.000Z",
  expiresAt: new Date(Date.parse("2026-11-01T00:00:00.000Z") + MAX_SEASON_OVERRIDE_MS).toISOString(),
  reason: "Preview the calendar",
  setBy: "admin",
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("season override repository", () => {
  it("persists overrides and appends who, when, and previous value using the local filesystem store", async () => {
    const backend = await localStore();
    const repository = createSeasonOverrideRepository(backend, () => Date.parse("2026-11-01T00:00:00.000Z"), async work => work());
    const first = await repository.set(validOverride, "", "admin");
    expect(first?.override).toEqual(validOverride);
    expect(first?.audit).toEqual([{ action: "set", who: "admin", at: "2026-11-01T00:00:00.000Z", previous: null }]);

    const second = await repository.clear(first!.updatedAt, "admin");
    expect(second?.override).toBeNull();
    expect(second?.audit[1]).toEqual({ action: "clear", who: "admin", at: "2026-11-01T00:00:00.001Z", previous: validOverride });
    expect(parseSeasonOverrideState(await backend.read(SEASON_OVERRIDE_KEY))).toEqual(second);
  });

  it("rejects compare-and-set writes with a stale timestamp", async () => {
    const repository = createSeasonOverrideRepository(await localStore(), () => Date.parse("2026-11-01T00:00:00.000Z"), async work => work());
    expect(await repository.set(validOverride, "stale", "admin")).toBeNull();
  });

  it("rejects stored overrides longer than 48 hours", () => {
    const tooLong = { ...validOverride, expiresAt: new Date(Date.parse(validOverride.setAt) + MAX_SEASON_OVERRIDE_MS + 1).toISOString() };
    expect(parseSeasonOverrideState(JSON.stringify({ version: 1, override: tooLong, updatedAt: validOverride.setAt, audit: [] })).override).toBeNull();
  });
});
