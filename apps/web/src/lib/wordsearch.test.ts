import { describe, expect, it } from "vitest";
import { generateWordsearch, parseWordsearch, wordAtSelection } from "./wordsearch";

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

  it("returns straight selections in eight directions", () => {
    expect(wordAtSelection({ startCell: 0, endCell: 32, gridSize: 15 })).toEqual([0, 16, 32]);
    expect(wordAtSelection({ startCell: 2, endCell: 30, gridSize: 15 })).toEqual([2, 16, 30]);
    expect(wordAtSelection({ startCell: 3, endCell: 19, gridSize: 15 })).toEqual([3, 19]);
    expect(wordAtSelection({ startCell: 0, endCell: 17, gridSize: 15 })).toBeNull();
  });
});
