import { beforeEach, describe, expect, it, vi } from "vitest";
import { getArchiveDayApiResult, type AdventApiResult, type AdventPublicDay } from "@/lib/advent";
import { GET } from "./route";

vi.mock("@/lib/advent", () => ({ getArchiveDayApiResult: vi.fn() }));

const unlockedDay: AdventPublicDay = {
  day: 4,
  title: "A winter fact",
  unlock_time: "2026-12-04T00:00:00Z",
  content_type: "fact",
  is_unlocked: true,
  payload: { text: "Hello winter" },
};

function request(day: unknown = "4") {
  const segment = typeof day === "string" ? day : "invalid";
  return {
    request: new Request(`https://example.test/api/advent/archive/${segment}`),
    context: { params: Promise.resolve({ day }) as Promise<{ day: string }> },
  };
}

describe("advent archive route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getArchiveDayApiResult).mockResolvedValue({ status: 200, body: unlockedDay });
  });

  it("returns unlocked archive content without caching it", async () => {
    const { request: req, context } = request();

    const response = await GET(req, context);

    expect(getArchiveDayApiResult).toHaveBeenCalledWith("4");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(unlockedDay);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns the shared locked-day response without exposing its payload", async () => {
    const lockedBody = {
      error: "Day is locked",
      day: 4,
      title: unlockedDay.title,
      unlock_time: unlockedDay.unlock_time,
    };
    vi.mocked(getArchiveDayApiResult).mockResolvedValue({ status: 403, body: lockedBody });
    const { request: req, context } = request();

    const response = await GET(req, context);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(lockedBody);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("keeps error responses private and uncached", async () => {
    const errorResult: AdventApiResult = { status: 404, body: { error: "Day not found" } };
    vi.mocked(getArchiveDayApiResult).mockResolvedValue(errorResult);
    const { request: req, context } = request("not-a-day");

    const response = await GET(req, context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(errorResult.body);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("passes malformed parameter types to the validating library boundary", async () => {
    vi.mocked(getArchiveDayApiResult).mockResolvedValue({ status: 404, body: { error: "Day not found" } });
    const { request: req, context } = request(["4"]);

    const response = await GET(req, context);

    expect(getArchiveDayApiResult).toHaveBeenCalledWith(["4"]);
    expect(response.status).toBe(404);
  });
});
