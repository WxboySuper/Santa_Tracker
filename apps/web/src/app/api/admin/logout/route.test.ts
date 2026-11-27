import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminTokenSessionId, revokeAdminToken } from "@/lib/auth";
import { appendAuthAudit } from "@/lib/admin-auth-state";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({
  getAdminTokenSessionId: vi.fn(),
  revokeAdminToken: vi.fn(),
  shouldUseSecureAdminCookie: vi.fn(() => true),
}));
vi.mock("@/lib/admin-auth-state", () => ({ appendAuthAudit: vi.fn() }));

describe("POST /api/admin/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminTokenSessionId).mockResolvedValue("session-one");
    vi.mocked(revokeAdminToken).mockRejectedValue(new Error("storage unavailable"));
  });

  it("preserves auth cookies so the owner can retry when revocation storage fails", async () => {
    const response = await POST(new Request("https://example.test/api/admin/logout", {
      method: "POST",
      headers: { cookie: "admin_token=token; admin_csrf=csrf", origin: "https://example.test" },
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({ error: "Admin authentication storage is unavailable; retry logout" });
    expect(appendAuthAudit).not.toHaveBeenCalled();
  });

  it("clears cookies after server-side revocation succeeds even if audit storage fails", async () => {
    vi.mocked(revokeAdminToken).mockResolvedValue(undefined);
    vi.mocked(appendAuthAudit).mockRejectedValue(new Error("audit storage unavailable"));

    const response = await POST(new Request("https://example.test/api/admin/logout", {
      method: "POST",
      headers: { cookie: "admin_token=token; admin_csrf=csrf", origin: "https://example.test" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("admin_token=; Path=/; Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("admin_csrf=; Path=/; Max-Age=0");
  });
});
