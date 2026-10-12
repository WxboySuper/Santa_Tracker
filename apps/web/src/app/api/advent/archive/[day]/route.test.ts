import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAdventEnabled } from "@/lib/config";
import { getArchiveDayContent, parseDayNumber, type AdventPublicDay } from "@/lib/advent";
import { GET } from "./route";

vi.mock("@/lib/config", () => ({ isAdventEnabled: vi.fn() }));
vi.mock("@/lib/advent", () => ({
  getArchiveDayContent: vi.fn(),
  parseDayNumber: vi.fn(),
}));

const unlockedDay: AdventPublicDay = {
  day: 4,
  title: "A winter fact",
  unlock_time: "2026-12-04T00:00:00Z",
  content_type: "fact",
  is_unlocked: true,
  payload: { text: "Hello winter" },
};

function request(day = "4") {
  return {
    request: new Request("https://example.test/api/advent/archive/" + day),
    context: { params: Promise.resolve({ day }) },
  };
}

describe("advent archive route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdventEnabled).mockReturnValue(true);
    vi.mocked(parseDayNumber).mockImplementation((value) => (value === "4" ? 4 : null));
    vi.mocked(getArchiveDayContent).mockResolvedValue(unlockedDay);
  });

  it("hides the archive when the Advent feature is disabled", async () => {
    vi.mocked(isAdventEnabled).mockReturnValue(false);
    const { request: req, context } = request();

    const response = await GET(req, context);

    expect(response.status).toBe(404);
    expect(parseDayNumber).not.toHaveBeenCalled();
    expect(getArchiveDayContent).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns unlocked archive content without caching it", async () => {
    const { request: req, context } = request();

    const response = await GET(req, context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(unlockedDay);
    expect(getArchiveDayContent).toHaveBeenCalledWith(4);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns a locked-day response without exposing its payload", async () => {
    vi.mocked(getArchiveDayContent).mockResolvedValue({ ...unlockedDay, is_unlocked: false });
    const { request: req, context } = request();

    const response = await GET(req, context);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Day is locked",
      day: 4,
      title: unlockedDay.title,
      unlock_time: unlockedDay.unlock_time,
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 404 for malformed and missing days", async () => {
    vi.mocked(getArchiveDayContent).mockResolvedValue(null);

    for (const day of ["not-a-day", "5"]) {
      const { request: req, context } = request(day);
      const response = await GET(req, context);
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });

  it("maps storage failures to a no-store 500 response", async () => {
    vi.mocked(getArchiveDayContent).mockRejectedValue(new Error("storage unavailable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { request: req, context } = request();

    const response = await GET(req, context);

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    errorSpy.mockRestore();
  });
});
