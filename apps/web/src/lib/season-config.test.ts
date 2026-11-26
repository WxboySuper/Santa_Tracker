import { describe, expect, it } from "vitest";
import { createSeasonConfigRepository, defaultSeasonConfigState, parseFeatureFlagOverrides, parseSeasonConfig, resolveFeatureFlags, seasonConfigStorageKey } from "./season-config";

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
