import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as AdminPasskeysModule from "@/lib/admin-passkeys";
import { getAdminTokenSessionId, requirePasskeyManagementAuth } from "@/lib/auth";
import { finishRegistration, PasskeyRegistrationConflictError, recordPasskeyFailure } from "@/lib/admin-passkeys";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({
  getAdminTokenSessionId: vi.fn(),
  requirePasskeyManagementAuth: vi.fn(),
  shouldUseSecureAdminCookie: vi.fn(() => true),
}));
vi.mock("@/lib/admin-passkeys", async importOriginal => {
  const actual = await importOriginal<typeof AdminPasskeysModule>();
  return { ...actual, finishRegistration: vi.fn(), recordPasskeyFailure: vi.fn() };
});

describe("POST /api/admin/passkeys/register/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePasskeyManagementAuth).mockResolvedValue({ ok: true });
    vi.mocked(getAdminTokenSessionId).mockResolvedValue("session-one");
    vi.mocked(finishRegistration).mockRejectedValue(new PasskeyRegistrationConflictError("Passkey is already registered"));
  });

  it("maps duplicate credential conflicts to 409 instead of storage unavailable", async () => {
    const request = new Request("https://example.test/api/admin/passkeys/register/verify", {
      method: "POST",
      headers: {
        cookie: "admin_token=token; admin_passkey_challenge=challenge-one",
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: "credential-one", response: {} }),
    });

    const response = await POST(request);
    const body = await response.json() as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("Passkey is already registered");
    expect(response.headers.get("set-cookie")).toContain("admin_passkey_challenge=");
    expect(recordPasskeyFailure).not.toHaveBeenCalled();
  });
});
