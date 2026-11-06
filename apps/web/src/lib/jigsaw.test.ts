import { describe, expect, it } from "vitest";
import { createPieceIds, getCellBounds, getGridSize, getJigsawSaveKey, getNextPiece, isEdgePiece, normalizeProgress, parseJigsaw } from "./jigsaw";

describe("jigsaw activity logic", () => {
  it("parses defaults and rejects malformed payloads", () => {
    expect(parseJigsaw({ kind: "jigsaw" })).toEqual({ scene: "cabin", pieces: 24 });
    expect(parseJigsaw({ kind: "jigsaw", scene: "harbor", pieces: 48 })).toEqual({ scene: "harbor", pieces: 48 });
    expect(parseJigsaw({ kind: "jigsaw", pieces: 13 })).toBeNull();
    expect(parseJigsaw(null)).toBeNull();
  });

  it("builds consistent piece grids and source bounds", () => {
    expect(getGridSize(12)).toEqual({ columns: 4, rows: 3 });
    expect(createPieceIds(48)).toHaveLength(48);
    expect(getCellBounds(5, 24)).toMatchObject({ y: 0, height: 18.75 });
    expect(getCellBounds(5, 24).x).toBeCloseTo(83.3333, 3);
    expect(getCellBounds(5, 24).width).toBeCloseTo(16.6667, 3);
    expect(getCellBounds(11, 24).y).toBeCloseTo(18.75, 3);
    expect(isEdgePiece(0, 6, 4)).toBe(true);
    expect(isEdgePiece(8, 6, 4)).toBe(false);
  });

  it("moves a keyboard target and normalizes saved progress", () => {
    expect(getNextPiece({ current: 0, direction: "right", count: 12, placed: [], edgeFirst: false })).toBe(1);
    expect(getNextPiece({ current: 0, direction: "right", count: 12, placed: [1], edgeFirst: false })).not.toBe(1);
    const suggested = getNextPiece({ current: 5, direction: "down", count: 12, placed: [], edgeFirst: true });
    expect(isEdgePiece(suggested, 4, 3)).toBe(true);
    expect(normalizeProgress({ placed: [1, 1, -1, 12, "2"] }, 12)).toEqual({ placed: [1] });
    expect(normalizeProgress({ placed: "bad" }, 24)).toEqual({ placed: [] });
  });

  it("keeps saved progress separate for each scene and piece count", () => {
    expect(getJigsawSaveKey({ scene: "cabin", pieces: 12 })).not.toBe(getJigsawSaveKey({ scene: "cabin", pieces: 24 }));
    expect(getJigsawSaveKey({ scene: "cabin", pieces: 24 })).not.toBe(getJigsawSaveKey({ scene: "street", pieces: 24 }));
  });
});
