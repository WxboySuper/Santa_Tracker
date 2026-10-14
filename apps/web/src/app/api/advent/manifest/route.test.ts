import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAdventEnabled } from "@/lib/config";
import { getManifest } from "@/lib/advent";
import { dynamic, GET } from "./route";

vi.mock("@/lib/config", () => ({ isAdventEnabled: vi.fn() }));
vi.mock("@/lib/advent", () => ({
  getManifest: vi.fn(),
  isAdventDataNotFoundError: (error: unknown) =>
    typeof error === "object" && error !== null && Reflect.get(error, "code") === "ADVENT_DATA_NOT_FOUND",
}));

describe("advent manifest route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdventEnabled).mockReturnValue(true);
    vi.mocked(getManifest).mockResolvedValue({ total_days: 0, days: [] });
  });

  it("is dynamic so unlock state follows request time", async () => {
    const response = await GET();

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("maps only explicit missing-data errors to 404", async () => {
    vi.mocked(getManifest).mockRejectedValue(new Error("Downstream day not found"));
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(logError).toHaveBeenCalledWith("Advent manifest error", expect.any(Error));
    logError.mockRestore();
  });

  it("maps an explicit Advent data-missing error to 404", async () => {
    vi.mocked(getManifest).mockRejectedValue(
      Object.assign(new Error("Advent calendar data is absent"), { code: "ADVENT_DATA_NOT_FOUND" }),
    );

    const response = await GET();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Advent calendar data not found" });
  });
});
