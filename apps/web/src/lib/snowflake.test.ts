import { describe, expect, it } from "vitest";
import { createSurpriseDesign, getSnowflakeCellCenters, isWedgeCell, normalizeSnowflakeDesign, parseSnowflake, restoreSnowflakeSave, toggleSnowflakeCell } from "./snowflake";

describe("snowflake activity", () => {
  it("parses optional seeds and rejects invalid payloads", () => {
    expect(parseSnowflake({ kind: "snowflake" })).toEqual({});
    expect(parseSnowflake({ kind: "snowflake", seed: 42 })).toEqual({ seed: 42 });
    expect(parseSnowflake({ kind: "snowflake", seed: "42" })).toBeNull();
  });

  it("keeps only unique wedge cells and supports toggling", () => {
    expect(normalizeSnowflakeDesign({ cells: [0, 8, 8, 9, 15, 16, -1] }).cells).toEqual([0, 8, 9, 16]);
    expect(toggleSnowflakeCell([8, 9], 8)).toEqual([9]);
    expect(toggleSnowflakeCell([8], 9)).toEqual([8, 9]);
  });

  it("makes repeatable, valid surprise designs", () => {
    const first = createSurpriseDesign(73);
    expect(createSurpriseDesign(73)).toEqual(first);
    expect(first.cells.length).toBeGreaterThanOrEqual(7);
    expect(normalizeSnowflakeDesign(first)).toEqual(first);
    for (let seed = 0; seed < 500; seed += 1) {
      expect(createSurpriseDesign(seed).cells.every(isWedgeCell)).toBe(true);
    }
  });

  it("mirrors each wedge cut into six symmetric positions", () => {
    const centers = getSnowflakeCellCenters(27);
    expect(centers).toHaveLength(6);
    const distances = centers.map(({ x, y }) => Math.hypot(x - 50, y - 50));
    const firstDistance = distances[0] ?? 0;
    expect(distances.every((distance) => Math.abs(distance - firstDistance) < 0.0001)).toBe(true);
    expect(getSnowflakeCellCenters(1)).toHaveLength(0);
  });

  it("restores only valid save envelopes", () => {
    expect(restoreSnowflakeSave(JSON.stringify({ activityId: "advent-snowflake", schemaVersion: 1, savedAtIso: "2026-12-04T00:00:00.000Z", payload: { cells: [1, 8, 9] } }))).toEqual({ cells: [8, 9] });
    expect(restoreSnowflakeSave("bad json")).toBeNull();
  });
});
