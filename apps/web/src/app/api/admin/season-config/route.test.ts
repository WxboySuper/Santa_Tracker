import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as SeasonConfigModule from "@/lib/season-config";
import { requireAdminAuth } from "@/lib/auth";
import { createSeasonConfigRepository, defaultSeasonConfigState, readEffectiveSeasonConfig, SeasonConfigCorruptError } from "@/lib/season-config";
import { GET, PUT } from "./route";

vi.mock("@/lib/auth", () => ({ requireAdminAuth: vi.fn() }));
vi.mock("@/lib/storage", () => ({ getKeyValueStore: vi.fn() }));
vi.mock("@/lib/cloudflare-bindings", () => ({ getSantaSnapshotsBucket: vi.fn() }));
vi.mock("@/lib/season-config", async importOriginal => {
  const actual = await importOriginal<typeof SeasonConfigModule>();
  return { ...actual, createSeasonConfigRepository: vi.fn(), readEffectiveSeasonConfig: vi.fn() };
});

const repo = {
  read: vi.fn(),
  readWithStatus: vi.fn(),
  replace: vi.fn(),
  repair: vi.fn(),
};

describe("/api/admin/season-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminAuth).mockResolvedValue({ ok: true });
    vi.mocked(createSeasonConfigRepository).mockReturnValue(repo);
    vi.mocked(readEffectiveSeasonConfig).mockResolvedValue({
      environment: "preview",
      updatedAt: "1970-01-01T00:00:00.000Z",
      seasonalConfig: { mode: "off-season", flags: { adventEnabled: false, mapEnabled: true, weatherEnabled: false, soundscapeEnabled: false }, activeSnapshotId: null },
      expiredFlags: [],
      modeOverrideStatus: "none",
      corrupt: true,
    });
  });

  it("surfaces corrupt storage in GET with a content-specific repair ETag", async () => {
    repo.readWithStatus.mockResolvedValue({ state: defaultSeasonConfigState("preview"), corrupt: true, etag: '"corrupt-token"' });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new Request("https://example.test/api/admin/season-config?environment=preview"));
    const body = await response.json() as { corrupt: boolean };

    expect(response.status).toBe(200);
    expect(body.corrupt).toBe(true);
    expect(response.headers.get("etag")).toBe('"corrupt-token"');
    expect(log).toHaveBeenCalledWith("Stored admin season configuration is corrupt", { environment: "preview" });
    log.mockRestore();
  });

  it("returns an explicit conflict instead of overwriting corrupt storage", async () => {
    repo.replace.mockRejectedValue(new SeasonConfigCorruptError());
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = new Request("https://example.test/api/admin/season-config?environment=preview", {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '"1970-01-01T00:00:00.000Z"' },
      body: JSON.stringify({ overrides: {}, reason: "Repair config" }),
    });

    const response = await PUT(request);
    const body = await response.json() as { corrupt: boolean };

    expect(response.status).toBe(409);
    expect(body.corrupt).toBe(true);
    log.mockRestore();
  });

  it("supports explicit repair against the corrupt-state ETag", async () => {
    repo.repair.mockResolvedValue({ ...defaultSeasonConfigState("preview"), updatedAt: "2026-11-26T12:00:00.000Z" });
    const request = new Request("https://example.test/api/admin/season-config?environment=preview", {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '"corrupt-token"' },
      body: JSON.stringify({ overrides: {}, reason: "Restore known config", repair: true }),
    });

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(repo.repair).toHaveBeenCalledWith("preview", "corrupt-token", {}, "admin", "Repair corrupt configuration: Restore known config");
  });

  it("caps streamed PUT bodies when Content-Length is absent", async () => {
    const request = new Request("https://example.test/api/admin/season-config?environment=preview", {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '"1970-01-01T00:00:00.000Z"' },
      body: `{"reason":"${"x".repeat(8_200)}","overrides":{}}`,
    });

    const response = await PUT(request);

    expect(request.headers.get("content-length")).toBeNull();
    expect(response.status).toBe(413);
    expect(repo.replace).not.toHaveBeenCalled();
  });
});

