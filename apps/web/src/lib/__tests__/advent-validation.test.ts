import { describe, expect, it } from "vitest";
import { validateAdventCalendar, type AdventDay } from "../advent";

function activity(payload: unknown): AdventDay {
  return {
    day: 1,
    title: "Cipher",
    unlock_time: "2026-12-01T12:00:00Z",
    content_type: "activity",
    payload: payload as AdventDay["payload"],
  };
}

describe("activity calendar validation", () => {
  it("accepts a kind payload or an embed URL", () => {
    for (const payload of [{ kind: "cipher" }, { url: "/advent/puzzle/index.html" }]) {
      expect(validateAdventCalendar([activity(payload)]).warnings).not.toContain("Day 1: Missing 'kind' or 'url' in payload");
    }
  });

  it("warns when neither kind nor URL is provided", () => {
    expect(validateAdventCalendar([activity({ message: "ABC" })]).warnings).toContain("Day 1: Missing 'kind' or 'url' in payload");
    expect(validateAdventCalendar([activity({ kind: "  " })]).warnings).toContain("Day 1: Missing 'kind' or 'url' in payload");
  });

  it("rejects unknown activity kinds and tolerates a missing payload", () => {
    expect(validateAdventCalendar([activity({ kind: "not-built-in" })]).warnings).toContain("Day 1: Missing 'kind' or 'url' in payload");
    expect(validateAdventCalendar([activity(null)]).warnings).toContain("Day 1: Missing 'kind' or 'url' in payload");
  });
});
