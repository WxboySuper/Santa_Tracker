import { describe, expect, it } from "vitest";
import { TRACKER_LEAD_MS, isFeatureOpen, nextSeasonBoundary, resolveAccess } from "../season";

const at = (iso: string): Date => new Date(iso);

describe("isFeatureOpen: advent", () => {
  it("is hidden well before the season", () => {
    expect(isFeatureOpen("advent", at("2026-11-05T12:00:00Z"))).toBe(false);
    expect(isFeatureOpen("advent", at("2026-03-01T00:00:00Z"))).toBe(false);
  });

  it("opens exactly at Nov 30 00:00 UTC", () => {
    expect(isFeatureOpen("advent", at("2026-11-29T23:59:59Z"))).toBe(false);
    expect(isFeatureOpen("advent", at("2026-11-30T00:00:00Z"))).toBe(true);
  });

  it("stays open through December and the post-flight period", () => {
    expect(isFeatureOpen("advent", at("2026-12-01T00:00:00Z"))).toBe(true);
    expect(isFeatureOpen("advent", at("2026-12-25T12:00:00Z"))).toBe(true);
    expect(isFeatureOpen("advent", at("2027-01-06T23:59:59Z"))).toBe(true);
  });

  it("closes at Jan 7 00:00 UTC and stays closed until the next season", () => {
    expect(isFeatureOpen("advent", at("2027-01-07T00:00:00Z"))).toBe(false);
    expect(isFeatureOpen("advent", at("2027-11-29T23:59:59Z"))).toBe(false);
    expect(isFeatureOpen("advent", at("2027-11-30T00:00:00Z"))).toBe(true);
  });
});

describe("isFeatureOpen: tracker", () => {
  const takeoffMs = Date.UTC(2026, 11, 24, 10, 0, 0);

  it("is hidden until shortly before takeoff", () => {
    expect(isFeatureOpen("tracker", at("2026-11-05T12:00:00Z"))).toBe(false);
    expect(isFeatureOpen("tracker", at("2026-12-01T00:00:00Z"))).toBe(false);
    expect(isFeatureOpen("tracker", new Date(takeoffMs - TRACKER_LEAD_MS - 1))).toBe(false);
  });

  it("opens exactly the lead time before takeoff", () => {
    expect(isFeatureOpen("tracker", new Date(takeoffMs - TRACKER_LEAD_MS))).toBe(true);
    expect(isFeatureOpen("tracker", new Date(takeoffMs))).toBe(true);
  });

  it("stays open for the post-flight replay, including across New Year", () => {
    expect(isFeatureOpen("tracker", at("2026-12-26T00:00:00Z"))).toBe(true);
    expect(isFeatureOpen("tracker", at("2027-01-03T00:00:00Z"))).toBe(true);
    expect(isFeatureOpen("tracker", at("2027-01-06T23:59:59Z"))).toBe(true);
  });

  it("closes at Jan 7 00:00 UTC", () => {
    expect(isFeatureOpen("tracker", at("2027-01-07T00:00:00Z"))).toBe(false);
    expect(isFeatureOpen("tracker", at("2027-06-01T00:00:00Z"))).toBe(false);
  });
});

describe("resolveAccess", () => {
  it("is open for everyone when the window is open", () => {
    expect(resolveAccess(true, false)).toBe("open");
    expect(resolveAccess(true, true)).toBe("open");
  });

  it("lets an admin through a closed window and nobody else", () => {
    expect(resolveAccess(false, true)).toBe("admin");
    expect(resolveAccess(false, false)).toBe("closed");
  });
});

describe("nextSeasonBoundary", () => {
  const ms = (iso: string): number => Date.parse(iso);

  it("points at Advent opening while the season is closed", () => {
    expect(nextSeasonBoundary(at("2026-11-05T12:00:00Z"))).toBe(ms("2026-11-30T00:00:00Z"));
  });

  it("then at the tracker opening, which is before takeoff, not at takeoff", () => {
    expect(nextSeasonBoundary(at("2026-11-30T00:00:00Z"))).toBe(Date.UTC(2026, 11, 24, 10, 0, 0) - TRACKER_LEAD_MS);
    expect(nextSeasonBoundary(at("2026-12-10T00:00:00Z"))).toBe(ms("2026-12-24T09:50:00Z"));
  });

  it("then at the close of the season", () => {
    expect(nextSeasonBoundary(at("2026-12-24T09:50:00Z"))).toBe(ms("2027-01-07T00:00:00Z"));
    expect(nextSeasonBoundary(at("2027-01-03T00:00:00Z"))).toBe(ms("2027-01-07T00:00:00Z"));
  });

  it("then rolls on to next year's Advent", () => {
    expect(nextSeasonBoundary(at("2027-01-07T00:00:00Z"))).toBe(ms("2027-11-30T00:00:00Z"));
    expect(nextSeasonBoundary(at("2027-06-01T00:00:00Z"))).toBe(ms("2027-11-30T00:00:00Z"));
  });

  it("is strictly after now, so a timer that fires on a boundary always moves forward", () => {
    const boundary = ms("2026-11-30T00:00:00Z");
    expect(nextSeasonBoundary(new Date(boundary))).toBeGreaterThan(boundary);
  });
});
