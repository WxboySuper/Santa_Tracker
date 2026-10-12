import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import { isValidUnlockTime } from "@/lib/advent";
import { previewAdminAdventDays } from "@/lib/admin-advent";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ requireAdminAuth: vi.fn() }));
vi.mock("@/lib/config", () => ({ isAdventEnabled: vi.fn() }));
vi.mock("@/lib/advent", () => ({ isValidUnlockTime: vi.fn() }));
vi.mock("@/lib/admin-advent", () => ({ previewAdminAdventDays: vi.fn() }));

function request(at?: string): NextRequest {
  const searchParams = new URLSearchParams();
  if (at !== undefined) searchParams.set("at", at);
  return { nextUrl: { searchParams } } as NextRequest;
}

describe("admin advent preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdventEnabled).mockReturnValue(true);
    vi.mocked(requireAdminAuth).mockResolvedValue({ ok: true });
    vi.mocked(isValidUnlockTime).mockReturnValue(true);
    vi.mocked(previewAdminAdventDays).mockResolvedValue({ status: 200, body: { days: [] } });
  });

  it("returns not found while the Advent feature is disabled", async () => {
    vi.mocked(isAdventEnabled).mockReturnValue(false);

    const response = await GET(request("2026-12-05T00:00:00Z"));

    expect(response.status).toBe(404);
    expect(requireAdminAuth).not.toHaveBeenCalled();
    expect(previewAdminAdventDays).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("requires admin authorization before previewing", async () => {
    vi.mocked(requireAdminAuth).mockResolvedValue({ ok: false, error: "Unauthorized", status: 401 });

    const response = await GET(request("2026-12-05T00:00:00Z"));

    expect(response.status).toBe(401);
    expect(previewAdminAdventDays).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects missing, non-ISO, and calendar-overflow timestamps", async () => {
    for (const value of [undefined, "12/05/2026", "2026-02-30T00:00:00Z"]) {
      const response = await GET(request(value));
      expect(response.status).toBe(400);
    }
    expect(previewAdminAdventDays).not.toHaveBeenCalled();
  });

  it.each([
    { value: "2026-12-05T12:34:56.1Z", milliseconds: 100 },
    { value: "2026-12-05T12:34:56.12Z", milliseconds: 120 },
    { value: "2026-12-05T12:34:56.123456Z", milliseconds: 123 },
  ])("accepts an ISO UTC timestamp with fractional seconds: $value", async ({ value, milliseconds }) => {
    const response = await GET(request(value));

    expect(response.status).toBe(200);
    expect(previewAdminAdventDays).toHaveBeenCalledWith(expect.any(Date));
    const previewTime = vi.mocked(previewAdminAdventDays).mock.calls[0]?.[0];
    expect(previewTime?.getUTCMilliseconds()).toBe(milliseconds);
  });
});
