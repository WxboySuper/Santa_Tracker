import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdminAuth } from "@/lib/auth";
import { clearSeasonOverride, readSeasonOverrideState, writeSeasonOverride } from "@/lib/season-overrides";
import { DELETE, GET, PUT } from "./route";

vi.mock("@/lib/auth", () => ({ requireAdminAuth: vi.fn() }));
vi.mock("@/lib/season-overrides", () => ({
  clearSeasonOverride: vi.fn(),
  readSeasonOverrideState: vi.fn(),
  writeSeasonOverride: vi.fn(),
  MAX_SEASON_OVERRIDE_MS: 48 * 60 * 60 * 1000,
}));

const updatedAt = "2026-11-01T00:00:00.000Z";
function request(method: string, body?: unknown, etag: string | null = updatedAt): Request {
  return new Request("https://example.test/api/admin/season-mode", {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(etag === null ? {} : { "If-Match": `"${etag}"` }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("admin season mode API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.mocked(requireAdminAuth).mockResolvedValue({ ok: true });
    vi.mocked(readSeasonOverrideState).mockResolvedValue({ version: 1, override: null, updatedAt, audit: [] });
    vi.mocked(writeSeasonOverride).mockImplementation(async override => ({
      version: 1, override, updatedAt, audit: [{ action: "set", who: "admin", at: updatedAt, previous: null }],
    }));
    vi.mocked(clearSeasonOverride).mockResolvedValue({
      version: 1, override: null, updatedAt, audit: [{ action: "clear", who: "admin", at: updatedAt, previous: null }],
    });
  });

  it("requires authentication before reading or writing", async () => {
    vi.mocked(requireAdminAuth).mockResolvedValue({ ok: false, error: "Authentication required", status: 401 });
    expect((await GET(request("GET"))).status).toBe(401);
    expect((await PUT(request("PUT", { mode: "advent", expiresAt: "2026-11-02T00:00:00Z", reason: "preview" }))).status).toBe(401);
    expect(readSeasonOverrideState).not.toHaveBeenCalled();
    expect(writeSeasonOverride).not.toHaveBeenCalled();
  });

  it("rejects invalid fields and expiry values", async () => {
    const invalid = await PUT(request("PUT", { mode: "invalid", expiresAt: "2026-11-02T00:00:00Z", reason: "preview" }));
    expect(invalid.status).toBe(400);
    expect(writeSeasonOverride).not.toHaveBeenCalled();
  });

  it("rejects an override that exceeds 48 hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(updatedAt));
    const response = await PUT(request("PUT", { mode: "advent", expiresAt: "2026-11-03T00:00:00.001Z", reason: "preview" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Season overrides may last at most 48 hours" });
    expect(writeSeasonOverride).not.toHaveBeenCalled();
  });

  it("sets an override with a server timestamp and the authenticated admin identity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(updatedAt));
    const response = await PUT(request("PUT", { mode: "advent", expiresAt: "2026-11-02T00:00:00Z", reason: " preview " }));
    expect(response.status).toBe(200);
    expect(writeSeasonOverride).toHaveBeenCalledWith({
      mode: "advent", setAt: updatedAt, expiresAt: "2026-11-02T00:00:00.000Z", reason: "preview", setBy: "admin",
    }, updatedAt, "admin");
  });

  it("reports expired overrides and rejects stale compare-and-set updates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T00:00:00.000Z"));
    vi.mocked(readSeasonOverrideState).mockResolvedValue({
      version: 1,
      override: { mode: "advent", setAt: updatedAt, expiresAt: "2026-11-02T00:00:00.000Z", reason: "preview", setBy: "admin" },
      updatedAt, audit: [],
    });
    const read = await GET(request("GET"));
    expect((await read.json()).overrideStatus).toBe("expired");
    vi.mocked(writeSeasonOverride).mockResolvedValue(null);
    const conflict = await PUT(request("PUT", { mode: "advent", expiresAt: "2026-11-03T12:00:00Z", reason: "preview" }));
    expect(conflict.status).toBe(412);
  });

  it("clears an override with compare-and-set", async () => {
    const response = await DELETE(request("DELETE"));
    expect(response.status).toBe(200);
    expect(clearSeasonOverride).toHaveBeenCalledWith(updatedAt, "admin");
  });
});
