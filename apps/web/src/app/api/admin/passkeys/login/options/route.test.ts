import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLoginRateLimit } from "@/lib/admin-login";
import { createAuthenticationChallenge, webAuthnSettings } from "@/lib/admin-passkeys";
import { getAdminClientIp } from "@/lib/admin-client-ip";
import { POST } from "./route";

vi.mock("@/lib/admin-login", () => ({ checkLoginRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/admin-passkeys", () => ({
  createAuthenticationChallenge: vi.fn(async () => ({ options: { challenge: "challenge-value" }, challenge: { id: "challenge-id" } })),
  recordPasskeyFailure: vi.fn(async () => undefined),
  webAuthnSettings: vi.fn(() => ({ origin: "https://example.test" })),
}));
vi.mock("@/lib/admin-passkey-http", () => ({
  setChallengeCookie: vi.fn((response: Response) => response),
  tooManyAttempts: vi.fn((retryAfterSeconds: number) => Response.json({}, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } })),
}));
vi.mock("@/lib/admin-client-ip", () => ({ getAdminClientIp: vi.fn(() => "198.51.100.1") }));

afterEach(() => vi.clearAllMocks());

describe("POST /api/admin/passkeys/login/options", () => {
  it("allows repeated challenge creation without counting success as a login failure", async () => {
    for (let index = 0; index < 6; index += 1) {
      const response = await POST(new Request("https://example.test/api/admin/passkeys/login/options", {
        method: "POST",
        headers: { origin: "https://example.test" },
      }));
      expect(response.status).toBe(200);
    }

    expect(getAdminClientIp).toHaveBeenCalledTimes(6);
    expect(checkLoginRateLimit).toHaveBeenCalledTimes(6);
    expect(checkLoginRateLimit).toHaveBeenCalledWith("passkey-options:198.51.100.1");
    expect(createAuthenticationChallenge).toHaveBeenCalledTimes(6);
    expect(webAuthnSettings).toHaveBeenCalledTimes(6);
  });
});
