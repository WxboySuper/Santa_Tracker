import { afterEach, describe, expect, it, vi } from "vitest";
import { appendAuthAudit, revokeAdminSession } from "@/lib/admin-auth-state";
import { getAdminTokenSessionId, requirePasskeyManagementAuth } from "@/lib/auth";
import { readCappedJson } from "@/lib/admin-json";
import { DELETE } from "./route";

vi.mock("@/lib/auth", () => ({
  getAdminTokenSessionId: vi.fn(async () => "current-session"),
  requirePasskeyManagementAuth: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/admin-auth-state", () => ({
  appendAuthAudit: vi.fn(async () => undefined),
  listActiveAdminSessions: vi.fn(async () => []),
  revokeAdminSession: vi.fn(async () => true),
}));
const TARGET_SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
vi.mock("@/lib/admin-json", () => ({ readCappedJson: vi.fn(async () => ({ ok: true, value: { sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } })) }));

afterEach(() => vi.clearAllMocks());

describe("DELETE /api/admin/sessions", () => {
  it("reports revocation success if the later audit write fails", async () => {
    vi.mocked(appendAuthAudit).mockRejectedValueOnce(new Error("audit storage unavailable"));

    const response = await DELETE(new Request("https://example.test/api/admin/sessions", {
      method: "DELETE",
      headers: { authorization: "Bearer admin-token" },
      body: JSON.stringify({ sessionId: TARGET_SESSION_ID }),
    }));

    expect(getAdminTokenSessionId).toHaveBeenCalledWith({ token: "admin-token" });
    expect(revokeAdminSession).toHaveBeenCalledWith(TARGET_SESSION_ID);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revoked: true });
    expect(requirePasskeyManagementAuth).toHaveBeenCalledOnce();
  });
});
