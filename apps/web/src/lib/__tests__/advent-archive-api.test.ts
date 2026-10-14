import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAdventEnabled } from "../config";
import {
  getArchiveDayApiResult,
  getArchiveDayContent,
  getDayContent,
  getManifest,
  isAdventFeatureDisabledError,
} from "../advent";

vi.mock("../config", () => ({ isAdventEnabled: vi.fn() }));

describe("archive API result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdventEnabled).mockReturnValue(true);
  });

  it("hides archive data while the Advent feature is disabled", async () => {
    vi.mocked(isAdventEnabled).mockReturnValue(false);

    await expect(getArchiveDayApiResult("4")).resolves.toEqual({
      status: 404,
      body: { error: "Not found" },
    });
  });

  it("blocks direct public library reads while the Advent feature is disabled", async () => {
    vi.mocked(isAdventEnabled).mockReturnValue(false);

    for (const read of [getManifest(), getDayContent(4), getArchiveDayContent(4)]) {
      await expect(read).rejects.toMatchObject({ code: "ADVENT_FEATURE_DISABLED" });
    }
    const thrown = await getManifest().catch((error: unknown) => error);
    expect(isAdventFeatureDisabledError(thrown)).toBe(true);
  });

  it("rejects an invalid mode before attempting to read calendar storage", async () => {
    await expect(getManifest({ mode: "preview" as never, filePath: "missing-advent-calendar.json" })).rejects.toThrow(
      "Unknown AdventMode: preview",
    );
  });

  it("rejects non-string and invalid day parameters before loading storage", async () => {
    for (const day of [undefined, null, ["4"], "0x10", "25"]) {
      await expect(getArchiveDayApiResult(day)).resolves.toEqual({
        status: 404,
        body: { error: "Day not found" },
      });
    }
  });
});
