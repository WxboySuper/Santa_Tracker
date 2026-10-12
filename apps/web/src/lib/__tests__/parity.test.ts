import { describe, it, expect, beforeEach } from "vitest";
import { validateLocations, createLocationFromPayload } from "../locations";
import { buildSimulatedFromLocations } from "../route-sim";
import { isPlayable, isUnlocked, toDict, validateAdventCalendar, type AdventDay } from "../advent";
import { createAdminToken, verifyAdminToken, verifyAdminPassword } from "../auth";
import fs from "fs";
import path from "path";

describe("Flask parity - locations", () => {
  it("validates location payload and normalizes lng", () => {
    const location = createLocationFromPayload({ name: "Test", latitude: 10, longitude: 190, utc_offset: 0 });
    expect(location.longitude).toBe(-170);
    const negative = createLocationFromPayload({ name: "Negative", latitude: 10, longitude: -190, utc_offset: 0 });
    expect(negative.longitude).toBe(170);
  });
  it("rejects invalid latitude", () => {
    expect(() => createLocationFromPayload({ name: "Bad", latitude: 100, longitude: 0, utc_offset: 0 })).toThrow();
  });
  it("validateLocations detects duplicates", () => {
    const firstLocation = createLocationFromPayload({ name: "A", latitude: 0, longitude: 0, utc_offset: 0 });
    const secondLocation = createLocationFromPayload({ name: "A", latitude: 1, longitude: 1, utc_offset: 1 });
    const validation = validateLocations([firstLocation, secondLocation]);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join()).toContain("Duplicate");
  });
  it("validateLocations warns on near-duplicate coords", () => {
    const firstLocation = createLocationFromPayload({ name: "A", latitude: 0, longitude: 0, utc_offset: 0 });
    const secondLocation = createLocationFromPayload({ name: "B", latitude: 0.00001, longitude: 0, utc_offset: 0 });
    const validation = validateLocations([firstLocation, secondLocation]);
    expect(validation.warnings.length).toBeGreaterThan(0);
  });
  it("buildSimulated sorts by utc_offset desc then priority", () => {
    const locs = [
      createLocationFromPayload({ name: "Low", latitude: 0, longitude: 0, utc_offset: 0, priority: 3 }),
      createLocationFromPayload({ name: "High", latitude: 1, longitude: 1, utc_offset: 5, priority: 1 }),
    ];
    const { simulated_route } = buildSimulatedFromLocations(locs);
    expect(simulated_route[0]?.name).toBe("High");
  });
});

describe("Advent parity", () => {
  const past: AdventDay = { day: 1, title: "Past", unlock_time: "2000-01-01T00:00:00Z", content_type: "fact", payload: { text: "hi" } };
  const future: AdventDay = { day: 2, title: "Future", unlock_time: "2099-12-31T00:00:00Z", content_type: "fact", payload: { text: "future" } };
  it("unlock logic respects time and override", () => {
    expect(isUnlocked(past)).toBe(true);
    expect(isUnlocked(future)).toBe(false);
    expect(isUnlocked({ ...future, is_unlocked_override: true })).toBe(true);
    expect(isUnlocked({ ...past, is_unlocked_override: false })).toBe(false);
  });
  it("uses an inclusive UTC boundary", () => {
    const boundary = new Date("2026-12-01T00:00:00.000Z");
    const day = { ...past, unlock_time: boundary.toISOString() };
    expect(isUnlocked(day, new Date(boundary.getTime() - 1))).toBe(false);
    expect(isUnlocked(day, boundary)).toBe(true);
  });
  it("keeps archive playability separate from live override state", () => {
    const day = { ...future, unlock_time: "2026-12-01T00:00:00Z", is_unlocked_override: null };
    const archiveTime = new Date("2026-12-25T00:00:00Z");
    expect(isUnlocked({ ...day, is_unlocked_override: false }, archiveTime)).toBe(false);
    expect(isPlayable(day, { mode: "archive", currentTime: archiveTime })).toBe(true);
  });
  it("toDict hides payload when locked", () => {
    const futureDay = toDict(future, { includePayload: true });
    expect(futureDay.payload).toBeUndefined();
    expect(futureDay.is_unlocked).toBe(false);
  });
  it("validateAdvent detects duplicates", () => {
    const days: AdventDay[] = [past, past];
    const res = validateAdventCalendar(days);
    expect(res.valid).toBe(false);
  });
});

describe("Auth parity - Flask password fallback removed", () => {
  beforeEach(() => {
    process.env.SECRET_KEY = "test-secret-key-1234567890123456";
    process.env.ADMIN_PASSWORD = "supersecret";
  });
  it("creates and verifies JWT", async () => {
    const token = await createAdminToken();
    expect(await verifyAdminToken(token)).toBe(true);
  });
  it("does NOT accept raw password as bearer", async () => {
    expect(await verifyAdminToken("supersecret")).toBe(false);
  });
  it("verifyAdminPassword timing-safe", async () => {
    expect(await verifyAdminPassword("supersecret")).toBe(true);
    expect(await verifyAdminPassword("wrong")).toBe(false);
  });
});

describe("No Flask in production paths", () => {
  it("does not import Flask in any app file", () => {
    const files = [
      "apps/web/src/lib/auth.ts",
      "apps/web/src/lib/locations.ts",
      "apps/web/src/lib/advent.ts",
    ];
    for (const fileName of files) {
      const filePath = path.resolve(process.cwd(), fileName);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).not.toContain("from flask");
      expect(content).not.toContain("import Flask");
    }
  });
  it("archive preserves Flask source", () => {
    expect(fs.existsSync(path.resolve(process.cwd(), "archive/flask-legacy/app.py"))).toBe(true);
  });
});
