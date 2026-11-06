import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdminAuth } from "@/lib/auth";
import { readFeatureFlags, writeFeatureFlags } from "@/lib/feature-flags";
import { GET, PUT } from "./route";

vi.mock("@/lib/auth", () => ({ requireAdminAuth: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ readFeatureFlags: vi.fn(), writeFeatureFlags: vi.fn() }));

function request(body?: string): Request {
  return new Request("https://example.test/api/admin/feature-flags", {
    method: body === undefined ? "GET" : "PUT",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body,
  });
}

describe("admin feature flags API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminAuth).mockResolvedValue({ ok: true });
    vi.mocked(readFeatureFlags).mockResolvedValue({ version: 1, hidden: { tracker: false, advent: false }, updatedAt: "" });
    vi.mocked(writeFeatureFlags).mockImplementation(async (hidden, updatedAt) => ({ version: 1, hidden, updatedAt }));
  });

  it("requires authentication", async () => {
    vi.mocked(requireAdminAuth).mockResolvedValue({ ok: false, error: "Authentication required", status: 401 });
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(readFeatureFlags).not.toHaveBeenCalled();
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
      expect(writeFeatureFlags).toHaveBeenCalledWith({ tracker: true, advent: false }, "2026-11-06T12:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
});
