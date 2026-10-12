import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAdventEnabled } from "../config";
import { getArchiveDayApiResult } from "../advent";

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

  it("rejects non-string and invalid day parameters before loading storage", async () => {
    for (const day of [undefined, null, ["4"], "0x10", "25"]) {
      await expect(getArchiveDayApiResult(day)).resolves.toEqual({
        status: 404,
        body: { error: "Day not found" },
      });
    }
  });
});
