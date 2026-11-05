import { describe, expect, it } from "vitest";
import { formatUnlockDate } from "../advent-ui";

describe("formatUnlockDate", () => {
  it("formats a UTC unlock instant as a short date", () => {
    expect(formatUnlockDate("2026-12-05T00:00:00Z", "en")).toBe("Dec 5");
  });

  it("uses UTC so a late-evening offset does not shift the day", () => {
    // 23:30 UTC on Dec 4 is still Dec 4, whatever the viewer's timezone.
    expect(formatUnlockDate("2026-12-04T23:30:00Z", "en")).toBe("Dec 4");
  });

  it("falls back to English for an unsupported locale tag", () => {
    expect(formatUnlockDate("2026-12-05T00:00:00Z", "not a locale!")).toBe("Dec 5");
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(formatUnlockDate("soon", "en")).toBe("soon");
  });
});
