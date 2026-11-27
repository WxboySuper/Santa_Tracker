import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as SeasonConfigModule from "@/lib/season-config";
import { requireAdminAuth } from "@/lib/auth";
import { readEffectiveSeasonConfig } from "@/lib/season-config";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ requireAdminAuth: vi.fn() }));
vi.mock("@/lib/season-config", async importOriginal => {
  const actual = await importOriginal<typeof SeasonConfigModule>();
  return { ...actual, readEffectiveSeasonConfig: vi.fn() };
});

describe("POST /api/admin/season-config/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminAuth).mockResolvedValue({ ok: true });
    vi.mocked(readEffectiveSeasonConfig).mockResolvedValue({
      environment: "preview",
      updatedAt: "1970-01-01T00:00:00.000Z",
      seasonalConfig: { mode: "off-season", flags: { adventEnabled: false, mapEnabled: true, weatherEnabled: false, soundscapeEnabled: false }, activeSnapshotId: null },
      expiredFlags: [],
      modeOverrideStatus: "none",
      corrupt: true,
    });
  });

  it("caps streamed preview bodies when Content-Length is absent", async () => {
    const request = new Request("https://example.test/api/admin/season-config/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"environment":"preview","at":"2026-11-26T00:00:00.000Z","overrides":{},"filler":"${"x".repeat(8_200)}"}`,
    });

    const response = await POST(request);

    expect(request.headers.get("content-length")).toBeNull();
    expect(response.status).toBe(413);
    expect(readEffectiveSeasonConfig).not.toHaveBeenCalled();
  });

  it("returns and logs a corruption flag during preview", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = new Request("https://example.test/api/admin/season-config/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ environment: "preview", at: "2026-11-26T00:00:00.000Z", overrides: {} }),
    });

    const response = await POST(request);
    const body = await response.json() as { corrupt: boolean; preview: { corrupt: boolean } };

    expect(body.corrupt).toBe(true);
    expect(body.preview.corrupt).toBe(true);
    expect(log).toHaveBeenCalledWith("Stored admin season configuration is corrupt during preview", { environment: "preview" });
    log.mockRestore();
  });
});
