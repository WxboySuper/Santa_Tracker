import { describe, expect, it } from "vitest";
import { trackerViewMode } from "./tracker-view-mode";

describe("trackerViewMode", () => {
  it("accepts immersive mode and leaves the reserved TV mode unsupported", () => {
    expect(trackerViewMode("immersive")).toBe("immersive");
    expect(trackerViewMode("tv")).toBe("standard");
    expect(trackerViewMode(null)).toBe("standard");
  });
});
