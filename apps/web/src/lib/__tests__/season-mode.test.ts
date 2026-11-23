import { describe, expect, it } from "vitest";
import { effectiveSeasonMode, seasonMode } from "../season-mode";
import type { SeasonModeOverride } from "../season-mode";

const at = (iso: string): Date => new Date(iso);

describe("seasonMode", () => {
  it("uses UTC annual boundaries for every mode", () => {
    expect(seasonMode(at("2026-10-31T23:59:59Z"))).toBe("off-season");
    expect(seasonMode(at("2026-11-01T00:00:00Z"))).toBe("preparation");
    expect(seasonMode(at("2026-11-30T23:59:59Z"))).toBe("preparation");
    expect(seasonMode(at("2026-12-01T00:00:00Z"))).toBe("advent");
    expect(seasonMode(at("2026-12-23T23:59:59Z"))).toBe("advent");
    expect(seasonMode(at("2026-12-24T00:00:00Z"))).toBe("flight");
    expect(seasonMode(at("2026-12-24T23:59:59Z"))).toBe("flight");
    expect(seasonMode(at("2026-12-25T00:00:00Z"))).toBe("post-season");
    expect(seasonMode(at("2027-01-06T23:59:59Z"))).toBe("post-season");
    expect(seasonMode(at("2027-01-07T00:00:00Z"))).toBe("off-season");
  });

  it("rolls across New Year and uses the UTC calendar regardless of local timezone", () => {
    expect(seasonMode(at("2027-01-01T00:00:00Z"))).toBe("post-season");
    expect(seasonMode(at("2027-11-01T00:00:00Z"))).toBe("preparation");
    expect(seasonMode(at("2027-12-24T00:00:00Z"))).toBe("flight");
  });
});

describe("effectiveSeasonMode", () => {
  const override: SeasonModeOverride = {
    mode: "preparation",
    setAt: "2026-12-01T00:00:00.000Z",
    expiresAt: "2026-12-01T12:00:00.000Z",
    reason: "Preview testing",
    setBy: "admin",
  };

  it("uses an active override", () => {
    expect(effectiveSeasonMode(at("2026-12-01T11:59:59Z"), "advent", override)).toEqual({ mode: "preparation", overrideStatus: "active" });
  });

  it("ignores and reports an expired override, including at the expiry instant", () => {
    expect(effectiveSeasonMode(at("2026-12-01T12:00:00Z"), "advent", override)).toEqual({ mode: "advent", overrideStatus: "expired" });
  });

  it("reports when no override exists", () => {
    expect(effectiveSeasonMode(at("2026-12-01T00:00:00Z"), "advent", null)).toEqual({ mode: "advent", overrideStatus: "none" });
  });
});
