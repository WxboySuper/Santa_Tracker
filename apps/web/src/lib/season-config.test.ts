import { describe, expect, it } from "vitest";
import { createSeasonConfigRepository, defaultSeasonConfigState, inspectSeasonConfig, parseFeatureFlagOverrides, parseSeasonConfig, resolveFeatureFlags, SeasonConfigCorruptError, seasonConfigStorageKey } from "./season-config";

describe("season configuration", () => {
  it("keeps configuration scoped to known environments and feature keys", () => {
    const unknown = JSON.stringify({
      version: 1,
      environment: "preview",
      overrides: { experimentalFlag: { enabled: true, expiresAt: null } },
      updatedAt: "2026-11-26T00:00:00.000Z",
      audit: [],
    });
    expect(parseSeasonConfig(unknown, "preview")).toEqual(defaultSeasonConfigState("preview"));
    expect(parseFeatureFlagOverrides({ mapEnabled: { enabled: false, expiresAt: null }, unknown: { enabled: true, expiresAt: null } })).toBeNull();
    expect(seasonConfigStorageKey("preview")).not.toBe(seasonConfigStorageKey("production"));
  });

  it.each([
    ["invalid JSON", "{"],
    ["schema-invalid JSON", JSON.stringify({ version: 1, environment: "preview", overrides: { unknown: true }, updatedAt: "bad", audit: [] })],
    ["another environment", JSON.stringify({ ...defaultSeasonConfigState("development"), updatedAt: "2026-11-26T12:00:00.000Z" })],
  ])("marks %s as corrupt while keeping safe runtime defaults", (_label, raw) => {
    expect(inspectSeasonConfig(raw, "preview")).toEqual({ state: defaultSeasonConfigState("preview"), corrupt: true });
    expect(parseSeasonConfig(raw, "preview")).toEqual(defaultSeasonConfigState("preview"));
  });

  it("refuses to overwrite corrupt stored configuration", async () => {
    const repository = createSeasonConfigRepository({
      async read() { return "not-json"; },
      async write() { throw new Error("must not write corrupt state"); },
    }, Date.now, async work => work());
    await expect(repository.replace("preview", defaultSeasonConfigState("preview").updatedAt, {}, "admin", "replace")).rejects.toBeInstanceOf(SeasonConfigCorruptError);
  });

  it("repairs corrupt storage only with its ETag and preserves the corrupt value as a backup", async () => {
    const valuesByKey = new Map<string, string>([[seasonConfigStorageKey("preview"), "not-json"]]);
    const repository = createSeasonConfigRepository({
      async read(key) { return valuesByKey.get(key) ?? null; },
      async write(key, body) { valuesByKey.set(key, body); },
    }, () => Date.parse("2026-11-26T12:00:00.000Z"), async work => work());
    const inspected = await repository.readWithStatus("preview");
    expect(inspected.corrupt).toBe(true);
    expect(inspected.etag).toMatch(/^"corrupt-[a-f0-9]{64}"$/);
    const expected = inspected.etag.slice(1, -1);

    expect(await repository.repair("preview", "corrupt-wrong", {}, "admin", "Repair corrupt configuration: test")).toBeNull();
    const repaired = await repository.repair("preview", expected, {}, "admin", "Repair corrupt configuration: test");

    expect(repaired?.audit[0]?.reason).toBe("Repair corrupt configuration: test");
    expect([...valuesByKey.entries()].some(([key, value]) => key.startsWith("season/config/corrupt-backups/preview/") && value === "not-json")).toBe(true);
    expect((await repository.readWithStatus("preview")).corrupt).toBe(false);
  });

  it("reverts expired feature overrides to registry defaults", () => {
    const overrides = parseFeatureFlagOverrides({
      mapEnabled: { enabled: false, expiresAt: "2026-11-26T00:00:00.000Z" },
      weatherEnabled: { enabled: true, expiresAt: null },
    });
    expect(overrides).not.toBeNull();
    expect(resolveFeatureFlags(overrides ?? {}, new Date("2026-11-27T00:00:00.000Z"))).toEqual({
      flags: { adventEnabled: false, mapEnabled: true, weatherEnabled: true, soundscapeEnabled: false },
      expiredFlags: ["mapEnabled"],
    });
  });

  it("audits environment-specific writes and rejects stale replacements", async () => {
    const valuesByKey = new Map<string, string>();
    const repository = createSeasonConfigRepository({
      async read(key) { return valuesByKey.get(key) ?? null; },
      async write(key, body) { valuesByKey.set(key, body); },
    }, () => Date.parse("2026-11-26T12:00:00.000Z"), async work => work());
    const override = { weatherEnabled: { enabled: true, expiresAt: null } };
    const saved = await repository.replace("preview", "1970-01-01T00:00:00.000Z", override, "admin", "Preview weather before launch");
    expect(saved?.audit[0]).toMatchObject({ actor: "admin", reason: "Preview weather before launch", previous: {}, next: override });
    expect(await repository.read("production")).toEqual(defaultSeasonConfigState("production"));
    expect(await repository.replace("preview", "1970-01-01T00:00:00.000Z", {}, "admin", "stale")).toBeNull();
  });
});
