import { describe, it, expect, beforeEach } from "vitest";
import { validateLocations, createLocationFromPayload, loadRouteNodesRaw, loadSantaRouteFromJson, saveSantaRouteToJson } from "../locations";
import { buildSimulatedFromLocations } from "../route-sim";
import { isPlayable, isUnlocked, parseDayNumber, toDict, validateAdventCalendar, type AdventDay } from "../advent";
import { createAdminToken, verifyAdminToken, verifyAdminPassword } from "../auth";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");

describe("Flask parity - locations", () => {
  it("preserves explicit is_stop values when reading modern and legacy routes", async () => {
    const modern = await loadRouteNodesRaw({ route_nodes: [{ id: "modern-flyover", type: "FLYOVER", is_stop: false, location: { name: "Modern", lat: 1, lng: 2 } }] });
    const legacy = await loadSantaRouteFromJson({ route: [{ name: "Legacy", latitude: 1, longitude: 2, type: "DELIVERY", is_stop: false }] });
    expect(modern[0]?.is_stop).toBe(false);
    expect(legacy[0]?.is_stop).toBe(false);
  });
  it("writes explicit false is_stop for modern nodes and legacy entries", async () => {
    const directory = fs.mkdtempSync(path.join(REPO_ROOT, "tmp-is-stop-"));
    try {
      const modernPath = path.join(directory, "modern.json");
      await saveSantaRouteToJson([{ id: "modern-flyover", type: "FLYOVER", is_stop: false, location: { name: "Modern", lat: 1, lng: 2 }, schedule: {}, stop_experience: {} }], modernPath);
      expect(JSON.parse(fs.readFileSync(modernPath, "utf8")).route_nodes[0].is_stop).toBe(false);

      const legacyPath = path.join(directory, "legacy.json");
      fs.writeFileSync(legacyPath, JSON.stringify({ route: [] }));
      await saveSantaRouteToJson([{ name: "Legacy", latitude: 1, longitude: 2, type: "DELIVERY", is_stop: false, notes: 42, fun_facts: undefined }], legacyPath);
      expect(JSON.parse(fs.readFileSync(legacyPath, "utf8")).route[0].is_stop).toBe(false);
      expect(JSON.parse(fs.readFileSync(legacyPath, "utf8")).route[0].notes).toBeNull();
      expect(JSON.parse(fs.readFileSync(legacyPath, "utf8")).route[0].fun_facts).toBeNull();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
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
  it("rejects invalid time inputs and unknown playability modes", () => {
    expect(() => isPlayable(past, { currentTime: new Date(Number.NaN) })).toThrow(/valid Date/);
    expect(() => isPlayable(past, { currentTime: new Date(), clock: () => new Date() })).toThrow(
      /only one of currentTime or clock/,
    );
    expect(() => isPlayable(past, { mode: "preview" as never })).toThrow(/Unknown AdventMode/);
    expect(() => isPlayable(past, { clock: () => "not a date" as never })).toThrow(/valid Date/);
  });
  it("parses string day parameters without coercing other values", () => {
    expect(parseDayNumber("1")).toBe(1);
    expect(parseDayNumber("01")).toBe(1);
    expect(parseDayNumber(" 24 ")).toBe(24);
    for (const value of [undefined, null, ["2"], "+1", "1.0", "1e1", "0x10", "25"]) {
      expect(parseDayNumber(value)).toBeNull();
    }
  });
  it("uses a false override as an archive takedown lock", () => {
    const day = { ...past, is_unlocked_override: false };
    const archiveTime = new Date("2026-12-25T00:00:00Z");
    expect(isUnlocked(day, archiveTime)).toBe(false);
    expect(isPlayable(day, { mode: "archive", currentTime: archiveTime })).toBe(false);
    expect(toDict(day, { mode: "archive", currentTime: archiveTime }).payload).toBeUndefined();
  });
  it("keeps archive unlocks schedule-based when the override is true", () => {
    const day = { ...future, unlock_time: "2026-12-01T00:00:00.000Z", is_unlocked_override: true };
    const boundary = new Date("2026-12-01T00:00:00.000Z");
    expect(isPlayable(day, { mode: "archive", currentTime: new Date(boundary.getTime() - 1) })).toBe(false);
    expect(isPlayable(day, { mode: "archive", currentTime: boundary })).toBe(true);
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
  it("requires a quiz questions field", () => {
    const quizDay: AdventDay = { ...past, content_type: "quiz", payload: {} };
    expect(validateAdventCalendar([quizDay]).warnings).toContain("Day 1: Missing 'questions' in payload");
    expect(validateAdventCalendar([{ ...quizDay, payload: { questions: [] } }]).warnings).toContain("Day 1: Invalid 'questions' payload");
    expect(validateAdventCalendar([{ ...quizDay, payload: { questions: [{ prompt: "", choices: [], answerIndex: 0 }] } }]).warnings).toContain("Day 1: Invalid 'questions' payload");
    expect(validateAdventCalendar([{ ...quizDay, payload: { questions: [{ prompt: "Pick one", choices: ["A", "B"], answerIndex: 1 }] } }]).warnings).not.toContain("Day 1: Invalid 'questions' payload");
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
      const filePath = path.resolve(REPO_ROOT, fileName);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).not.toContain("from flask");
      expect(content).not.toContain("import Flask");
    }
  });
  it("archive preserves Flask source", () => {
    expect(fs.existsSync(path.resolve(REPO_ROOT, "archive/flask-legacy/app.py"))).toBe(true);
  });
});
