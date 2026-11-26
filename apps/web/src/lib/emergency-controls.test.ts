import { describe, expect, it } from "vitest";
import { createEmergencyControlsRepository, EMERGENCY_CONTROLS_KEY, parseEmergencyControls, type EmergencyControlValues } from "./emergency-controls";

const values: EmergencyControlValues = {
  noMap: true,
  simplifiedTracker: false,
  killedFeatures: { weather: true, soundscape: false },
};

describe("emergency controls", () => {
  it("fails closed when controls are missing or invalid", () => {
    expect(parseEmergencyControls(null)).toMatchObject({ noMap: true, simplifiedTracker: true, killedFeatures: { weather: true, soundscape: true } });
    expect(parseEmergencyControls("invalid")).toMatchObject({ noMap: true, simplifiedTracker: true, killedFeatures: { weather: true, soundscape: true } });
  });

  it("records previous and next values and rejects stale writes", async () => {
    const valuesByKey = new Map<string, string>();
    const repo = createEmergencyControlsRepository({
      async read(key) { return valuesByKey.get(key) ?? null; },
      async write(key, body) { valuesByKey.set(key, body); },
    }, () => Date.parse("2026-11-26T12:00:00.000Z"), async work => work());

    const first = await repo.replace(values, "", "admin", "Map delivery issue");
    expect(first).toMatchObject({ ...values, audit: [{ actor: "admin", reason: "Map delivery issue", previous: { noMap: true, simplifiedTracker: true, killedFeatures: { weather: true, soundscape: true } }, next: values }] });
    expect(valuesByKey.has(EMERGENCY_CONTROLS_KEY)).toBe(true);
    expect(await repo.replace(values, "", "admin", "stale write")).toBeNull();
  });
});
