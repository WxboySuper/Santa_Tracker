import { describe, expect, it } from "vitest";
import { findWordsearchPlacement, generateWordsearch, generateWordsearchWithLimit, parseWordsearch, shouldCancelWordsearchSelection, wordAtSelection, wordsearchConfigKey } from "./wordsearch";

const config = parseWordsearch({ kind: "wordsearch" });

describe("wordsearch", () => {
  it("validates defaults and rejects malformed word lists", () => {
    expect(config?.words).toHaveLength(10);
    expect(parseWordsearch({ kind: "wordsearch", words: ["SNOW"] })?.words).toEqual(["SNOW"]);
    expect(parseWordsearch({ kind: "wordsearch", words: [] })).toBeNull();
    expect(parseWordsearch({ kind: "wordsearch", words: [...(config?.words ?? []), "BAD WORD"] })).toBeNull();
    expect(parseWordsearch({ kind: "wordsearch", seed: 1.2 })).toBeNull();
  });

  it("generates the same grid and valid placements for a seed", () => {
    expect(config).not.toBeNull();
    const first = generateWordsearch(config!);
    expect(generateWordsearch(config!)).toEqual(first);
    for (const { word, cells } of first.placements) {
      expect(cells.map((cell) => first.grid[Math.floor(cell / 15)]?.[cell % 15]).join("")).toBe(word);
    }
    expect(new Set(first.grid.flat()).size).toBeGreaterThan(1);
  });

  it("places the default list across a useful spread of seeds", () => {
    for (let seed = 0; seed < 40; seed += 1) {
      expect(() => generateWordsearch({ ...config!, seed })).not.toThrow();
    }
  });

  it("varies the filler grid for seed zero", () => {
    const zero = generateWordsearch({ ...config!, seed: 0 });
    expect(new Set(zero.grid.flat()).size).toBeGreaterThan(1);
    expect(zero).not.toEqual(generateWordsearch({ ...config!, seed: 1 }));
  });

  it("rejects overly dense lists and bounds adversarial placement attempts", () => {
    const denseWords = Array.from({ length: 16 }, (_, index) => `ABCDEFGHIJK${String.fromCharCode(65 + index)}`);
    expect(parseWordsearch({ kind: "wordsearch", words: denseWords })).toBeNull();
    expect(() => generateWordsearchWithLimit({
      config: { seed: 4, words: ["AAAAAAAAAAAB", "AAAAAAAAAAAC"] },
      attemptLimit: 1,
    })).toThrow("Unable to place every word within 1 candidate attempts");
  });

  it("returns straight selections in eight directions", () => {
    expect(wordAtSelection({ startCell: 0, endCell: 32, gridSize: 15 })).toEqual([0, 16, 32]);
    expect(wordAtSelection({ startCell: 2, endCell: 30, gridSize: 15 })).toEqual([2, 16, 30]);
    expect(wordAtSelection({ startCell: 3, endCell: 19, gridSize: 15 })).toEqual([3, 19]);
    expect(wordAtSelection({ startCell: 0, endCell: 17, gridSize: 15 })).toBeNull();
    expect(wordAtSelection({ startCell: 7, endCell: 7, gridSize: 15 })).toBeNull();
  });

  it("cancels a pending keyboard selection on Escape", () => {
    expect(shouldCancelWordsearchSelection({ key: "Escape", selectionPending: true })).toBe(true);
    expect(shouldCancelWordsearchSelection({ key: "Escape", selectionPending: false })).toBe(false);
    expect(shouldCancelWordsearchSelection({ key: "Enter", selectionPending: true })).toBe(false);
  });

  it("keys transient state to its puzzle config", () => {
    const base = { seed: 1, words: ["SNOW", "EMBER"] };
    expect(wordsearchConfigKey(base)).not.toBe(wordsearchConfigKey({ ...base, seed: 2 }));
    expect(wordsearchConfigKey(base)).not.toBe(wordsearchConfigKey({ ...base, words: ["SNOW", "CANDLE"] }));
  });

  it("only accepts a found word at its placed cells in either direction", () => {
    const placements = [{ word: "EMBER", cells: [1, 2, 3, 4, 5] }];
    expect(findWordsearchPlacement({ placements, selectedCells: [1, 2, 3, 4, 5], foundWords: [] })).toEqual(placements[0]);
    expect(findWordsearchPlacement({ placements, selectedCells: [5, 4, 3, 2, 1], foundWords: [] })).toEqual(placements[0]);
    expect(findWordsearchPlacement({ placements, selectedCells: [6, 7, 8, 9, 10], foundWords: [] })).toBeNull();
    expect(findWordsearchPlacement({ placements, selectedCells: [1, 2, 3, 4, 5], foundWords: ["EMBER"] })).toBeNull();
  });
});
