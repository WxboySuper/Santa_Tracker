import { describe, expect, it } from "vitest";
import { decode, encode, isCipherAnswerCorrect, normalizeCipherAnswer, parseCipher } from "../cipher";

describe("Caesar cipher helpers", () => {
  it("encodes and decodes with wraparound at Z", () => {
    expect(encode("YZ ABC", 2)).toBe("AB CDE");
    expect(decode("AB CDE", 2)).toBe("YZ ABC");
  });

  it("preserves spaces and normalizes answer case and extra whitespace", () => {
    expect(encode("Meet   me", 3)).toBe("PHHW   PH");
    expect(normalizeCipherAnswer("  meet   me  ")).toBe("MEET ME");
    expect(isCipherAnswerCorrect("  meet   me ", "MEET ME")).toBe(true);
    expect(isCipherAnswerCorrect("meet you", "MEET ME")).toBe(false);
    expect(isCipherAnswerCorrect("  merry   christmas ", "MERRY CHRISTMAS")).toBe(true);
  });

  it("parses valid config and an optional hint", () => {
    expect(parseCipher({ kind: "cipher", message: "Meet me", shift: 25, hint: "A hint" })).toEqual({
      message: "Meet me",
      shift: 25,
      hint: "A hint",
    });
    expect(parseCipher({ message: "ABC", shift: 1 })).toEqual({ message: "ABC", shift: 1 });
    expect(parseCipher({ message: "A".repeat(60), shift: 1 })).not.toBeNull();
  });

  it("rejects malformed messages, shifts, and hints", () => {
    const valid = { message: "ABC", shift: 1 };
    for (const message of ["AB", "A".repeat(61), "HELLO!", "HELLO 2", "HELLO\nTHERE", "ÉTOILE"]) {
      expect(parseCipher({ ...valid, message })).toBeNull();
    }
    for (const shift of [0, 26, 1.5, "3", Number.NaN]) {
      expect(parseCipher({ ...valid, shift })).toBeNull();
    }
    expect(parseCipher({ ...valid, hint: 5 })).toBeNull();
    expect(parseCipher({ message: "   ", shift: 1 })).toBeNull();
    expect(parseCipher(null)).toBeNull();
    expect(parseCipher([])).toBeNull();
  });
});
