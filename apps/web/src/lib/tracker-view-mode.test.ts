import { describe, expect, it } from "vitest";
import { trackerViewMode } from "./tracker-view-mode";

describe("trackerViewMode", () => {
  it("accepts immersive and TV mode", () => {
    expect(trackerViewMode("immersive")).toBe("immersive");
    expect(trackerViewMode("tv")).toBe("tv");
    expect(trackerViewMode(null)).toBe("standard");
  });
});
