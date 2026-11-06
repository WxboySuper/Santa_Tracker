import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdminAuth } from "@/lib/auth";
import { readFreshFeatureFlags, writeFeatureFlags } from "@/lib/feature-flags";
import { GET, PUT } from "./route";

vi.mock("@/lib/auth", () => ({ requireAdminAuth: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ readFreshFeatureFlags: vi.fn(), writeFeatureFlags: vi.fn() }));

function request(body?: string): Request {
  return new Request("https://example.test/api/admin/feature-flags", {
    method: body === undefined ? "GET" : "PUT",
    headers: body === undefined ? {} : { "Content-Type": "application/json", "If-Match": '""' },
    body,
  });
}

describe("admin feature flags API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminAuth).mockResolvedValue({ ok: true });
    vi.mocked(readFreshFeatureFlags).mockResolvedValue({ version: 1, hidden: { tracker: false, advent: false }, updatedAt: "" });
    vi.mocked(writeFeatureFlags).mockImplementation(async hidden => ({ version: 1, hidden, updatedAt: new Date().toISOString() }));
  });

  it("requires authentication", async () => {
    vi.mocked(requireAdminAuth).mockResolvedValue({ ok: false, error: "Authentication required", status: 401 });
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(readFreshFeatureFlags).not.toHaveBeenCalled();
  });

  it("returns current flags with a validator for the next replacement", async () => {
    vi.mocked(readFreshFeatureFlags).mockResolvedValue({
      version: 1,
      hidden: { tracker: true, advent: false },
      updatedAt: "2026-11-06T12:00:00.000Z",
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe('"2026-11-06T12:00:00.000Z"');
    expect(await response.json()).toEqual({
      version: 1,
      hidden: { tracker: true, advent: false },
      updatedAt: "2026-11-06T12:00:00.000Z",
    });
  });

  it("reports an admin read error when storage is unavailable", async () => {
    vi.mocked(readFreshFeatureFlags).mockRejectedValue(new Error("storage offline"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects malformed or extra request fields", async () => {
    const response = await PUT(request(JSON.stringify({ version: 1, hidden: { tracker: true, advent: false }, updatedAt: "client" })));
    expect(response.status).toBe(400);
    expect(writeFeatureFlags).not.toHaveBeenCalled();
  });

  it("replaces the flags and assigns updatedAt on the server", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T12:00:00.000Z"));
    try {
      const response = await PUT(request(JSON.stringify({ version: 1, hidden: { tracker: true, advent: false } })));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ version: 1, hidden: { tracker: true, advent: false }, updatedAt: "2026-11-06T12:00:00.000Z" });
      expect(writeFeatureFlags).toHaveBeenCalledWith({ tracker: true, advent: false }, "");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a stale replacement without writing it", async () => {
    vi.mocked(writeFeatureFlags).mockResolvedValue(null);
    const response = await PUT(request(JSON.stringify({ version: 1, hidden: { tracker: true, advent: false } })));
    expect(response.status).toBe(412);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
