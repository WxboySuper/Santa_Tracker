import { describe, expect, it } from "vitest";
import { createEmergencyControlsRepository, DEFAULT_EMERGENCY_CONTROLS, EMERGENCY_CONTROLS_KEY, parseEmergencyControls, type EmergencyControlValues } from "./emergency-controls";

const values: EmergencyControlValues = {
  noMap: true,
  simplifiedTracker: false,
  killedFeatures: { weather: true, soundscape: false },
};

describe("emergency controls", () => {
  it("uses defaults when no controls have been saved and fails safe on invalid data", () => {
    expect(parseEmergencyControls(null)).toBe(DEFAULT_EMERGENCY_CONTROLS);
    expect(parseEmergencyControls("invalid")).toMatchObject({ noMap: true, simplifiedTracker: true, killedFeatures: { weather: true, soundscape: true } });
  });

  it("records previous and next values and rejects stale writes", async () => {
    const valuesByKey = new Map<string, string>();
    const repo = createEmergencyControlsRepository({
      async read(key) { return valuesByKey.get(key) ?? null; },
      async write(key, body) { valuesByKey.set(key, body); },
    }, () => Date.parse("2026-11-26T12:00:00.000Z"), async work => work());

    const first = await repo.replace(values, "", "admin", "Map delivery issue");
    expect(first).toMatchObject({ ...values, audit: [{ actor: "admin", reason: "Map delivery issue", previous: { noMap: false, simplifiedTracker: false, killedFeatures: { weather: false, soundscape: false } }, next: values }] });
    expect(valuesByKey.has(EMERGENCY_CONTROLS_KEY)).toBe(true);
    expect(await repo.replace(DEFAULT_EMERGENCY_CONTROLS, "", "admin", "stale write")).toBeNull();
  });
});
