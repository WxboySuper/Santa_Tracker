import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPasskeys, needsSecondRecoveryCode, replaceRecoveryCodes, signInWithRecoveryCode } from "./admin-passkey-client";

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin passkey client", () => {
  it("trims a recovery code before sending it", async () => {
    const fetchMock = respond(200, { authenticated: true });
    await expect(signInWithRecoveryCode("  ABCD-1234 \n")).resolves.toEqual({ ok: true, value: null });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBe(JSON.stringify({ code: "ABCD-1234" }));
  });

  it("adds the wait time to a throttled response", async () => {
    respond(429, { error: "Too many authentication attempts" }, { "Retry-After": "60" });
    await expect(signInWithRecoveryCode("x")).resolves.toEqual({ ok: false, status: 429, error: "Too many authentication attempts. Try again in 60 s." });
  });

  it("reports a network failure without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    const result = await loadPasskeys();
    expect(result.ok).toBe(false);
  });

  it("keeps only well-formed passkeys and codes", async () => {
    respond(200, { passkeys: [{ id: "a", transports: ["internal", 3] }, "junk"], recoveryCodesRemaining: 7 });
    await expect(loadPasskeys()).resolves.toEqual({ ok: true, value: { passkeys: [{ id: "a", transports: ["internal"] }], recoveryCodesRemaining: 7 } });
    respond(200, { recoveryCodes: ["one", 2, "three"] });
    await expect(replaceRecoveryCodes()).resolves.toEqual({ ok: true, value: { recoveryCodes: ["one", "three"] } });
  });

  it("recognises when a recovery session needs a second code", () => {
    expect(needsSecondRecoveryCode({ ok: false, status: 403, error: "Use a second recovery code to authorize passkey management" })).toBe(true);
    expect(needsSecondRecoveryCode({ ok: false, status: 403, error: "Invalid CSRF token" })).toBe(false);
    expect(needsSecondRecoveryCode({ ok: true, value: null })).toBe(false);
  });
});
