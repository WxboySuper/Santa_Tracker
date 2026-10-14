import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDayApiResult } from "@/lib/advent";
import { dynamic, GET } from "./route";

vi.mock("@/lib/advent", () => ({ getDayApiResult: vi.fn() }));

describe("advent day route", () => {
  const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDayApiResult).mockResolvedValue({ status: 200, body: { day: 4 } });
  });

  afterEach(() => logError.mockClear());

  it("is dynamic and returns the shared uncached day response", async () => {
    const response = await GET(new Request("https://example.test/api/advent/4"), {
      params: Promise.resolve({ day: "4" }),
    });

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns a logged JSON 500 with no-store headers when the handler throws", async () => {
    vi.mocked(getDayApiResult).mockRejectedValue(new Error("Unexpected failure"));
    const response = await GET(new Request("https://example.test/api/advent/4"), {
      params: Promise.resolve({ day: "4" }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(logError).toHaveBeenCalledWith("Advent day route error", expect.any(Error));
  });
});
