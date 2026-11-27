import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as AdminPasskeysModule from "@/lib/admin-passkeys";
import { PasskeyRequestError, loginWithRecoveryCode } from "@/lib/admin-passkeys";
import { POST } from "./route";

vi.mock("@/lib/admin-login", () => ({
  checkLoginRateLimit: vi.fn(async () => null),
  clearLoginAttempts: vi.fn(),
  recordLoginAttempt: vi.fn(async () => null),
}));
vi.mock("@/lib/admin-client-ip", () => ({ getAdminClientIp: vi.fn(() => "198.51.100.42") }));
vi.mock("@/lib/admin-passkeys", async importOriginal => {
  const actual = await importOriginal<typeof AdminPasskeysModule>();
  return { ...actual, loginWithRecoveryCode: vi.fn(), recordPasskeyFailure: vi.fn(), webAuthnSettings: vi.fn(() => ({ rpId: "example.test", origin: "https://example.test" })) };
});

describe("POST /api/admin/passkeys/recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loginWithRecoveryCode).mockRejectedValue(new PasskeyRequestError("Recovery codes are not configured"));
  });

  it("reports an unconfigured recovery path as a conflict", async () => {
    const response = await POST(new Request("https://example.test/api/admin/passkeys/recovery", {
      method: "POST",
      headers: { origin: "https://example.test", "content-type": "application/json" },
      body: JSON.stringify({ code: "ABCD" }),
    }));
    const body = await response.json() as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("Recovery codes are not configured");
  });
});
