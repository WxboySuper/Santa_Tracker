import { describe, expect, it } from "vitest";
import { ADVENT_NO_STORE_HEADERS } from "../advent-http";
import { isNotFoundError } from "../errors";

describe("isNotFoundError", () => {
  it("recognizes ENOENT on local and wrapped error shapes", () => {
    expect(isNotFoundError(Object.assign(new Error("file is missing"), { code: "ENOENT" }))).toBe(true);
    expect(isNotFoundError({ code: "ENOENT" })).toBe(true);
    expect(isNotFoundError({ cause: "ENOENT" })).toBe(true);
    expect(isNotFoundError({ cause: { code: "ENOENT" } })).toBe(true);
  });

  it("does not treat unrelated not-found messages as missing files", () => {
    expect(isNotFoundError(new Error("Downstream day not found"))).toBe(false);
    expect(isNotFoundError({ message: 123, code: "EIO" })).toBe(false);
  });

  it("does not throw when error properties have hostile getters or circular causes", () => {
    const error = {} as { code?: unknown; cause?: unknown; message?: unknown };
    Object.defineProperty(error, "message", { get: () => { throw new Error("getter failed"); } });
    Object.defineProperty(error, "cause", { get: () => error });

    expect(() => isNotFoundError(error)).not.toThrow();
    expect(isNotFoundError(error)).toBe(false);
  });
});

describe("Advent response headers", () => {
  it("keeps the shared no-store header object immutable", () => {
    expect(Object.isFrozen(ADVENT_NO_STORE_HEADERS)).toBe(true);
  });
});
