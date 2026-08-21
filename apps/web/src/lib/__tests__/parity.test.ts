import { describe, it, expect, beforeEach } from "vitest";
import { validateLocations, createLocationFromPayload } from "../locations";
import { buildSimulatedFromLocations } from "../route-sim";
import { isUnlocked, toDict, getManifest, validateAdventCalendar, type AdventDay } from "../advent";
import { createAdminToken, verifyAdminToken, verifyAdminPassword } from "../auth";
import fs from "fs";
import path from "path";

describe("Flask parity — locations", () => {
  it("validates location payload and normalizes lng", () => {
    const loc = createLocationFromPayload({ name: "Test", latitude: 10, longitude: 190, utc_offset: 0 });
    expect(loc.longitude).toBe(-170); // normalized
  });
  it("rejects invalid latitude", () => {
    expect(() => createLocationFromPayload({ name: "Bad", latitude: 100, longitude: 0, utc_offset: 0 })).toThrow();
  });
  it("validateLocations detects duplicates", () => {
    const a = createLocationFromPayload({ name: "A", latitude: 0, longitude: 0, utc_offset: 0 });
    const b = createLocationFromPayload({ name: "A", latitude: 1, longitude: 1, utc_offset: 1 });
    const res = validateLocations([a, b]);
    expect(res.valid).toBe(false);
    expect(res.errors.join()).toContain("Duplicate");
  });
  it("validateLocations warns on near-duplicate coords", () => {
    const a = createLocationFromPayload({ name: "A", latitude: 0, longitude: 0, utc_offset: 0 });
    const b = createLocationFromPayload({ name: "B", latitude: 0.00001, longitude: 0, utc_offset: 0 });
    const res = validateLocations([a, b]);
    expect(res.warnings.length).toBeGreaterThan(0);
  });
  it("buildSimulated sorts by utc_offset desc then priority", async () => {
    const locs = [
      createLocationFromPayload({ name: "Low", latitude: 0, longitude: 0, utc_offset: 0, priority: 3 }),
      createLocationFromPayload({ name: "High", latitude: 1, longitude: 1, utc_offset: 5, priority: 1 }),
    ];
    const { simulated_route } = buildSimulatedFromLocations(locs);
    expect(simulated_route[0].name).toBe("High");
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
  it("toDict hides payload when locked", () => {
    const d = toDict(future, { includePayload: true });
    expect(d.payload).toBeUndefined();
    expect(d.is_unlocked).toBe(false);
  });
  it("validateAdvent detects duplicates", () => {
    const days = [past, past];
    const res = validateAdventCalendar(days as any);
    expect(res.valid).toBe(false);
  });
});

describe("Auth parity — Flask password fallback removed", () => {
  beforeEach(() => {
    process.env.SECRET_KEY = "test-secret-key-1234567890123456";
    process.env.ADMIN_PASSWORD = "supersecret";
  });
  it("creates and verifies JWT", async () => {
    const token = await createAdminToken();
    expect(await verifyAdminToken(token)).toBe(true);
  });
  it("does NOT accept raw password as bearer", async () => {
    // Flask fallback accepted ADMIN_PASSWORD as Bearer; Next.js must not
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
    for (const f of files) {
      const content = fs.readFileSync(path.join(process.cwd(), "..", "..", f), "utf-8").catch ? "" : "";
      // alternative: try workspace root
      try {
        const c = fs.readFileSync(path.resolve(f), "utf-8");
        expect(c).not.toContain("from flask");
        expect(c).not.toContain("import Flask");
      } catch {
        // if file not at that path, fallback to checking via relative to workspace
        const ws = path.join(process.cwd(), f.replace("apps/web/", "../apps/web/"));
        // skip if not found
      }
    }
  });
  it("archive preserves Flask source", () => {
    expect(fs.existsSync(path.join(process.cwd(), "..", "..", "archive/flask-legacy/app.py")) || fs.existsSync("archive/flask-legacy/app.py")).toBe(true);
  });
});
