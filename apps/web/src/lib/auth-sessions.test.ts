import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createAdminSession, installPasskey, readActiveSession, resetAdminAuthStateForTests } from "./admin-auth-state";
import { createAdminToken, getAdminTokenCsrfToken, getAdminTokenSessionId, requireAdminAuth, revokeAdminToken, verifyAdminToken } from "./auth";
import { POST as logout } from "@/app/api/admin/logout/route";
import { DELETE as revokeSession, GET as listSessions } from "@/app/api/admin/sessions/route";

async function createCookieSession() {
  const token = await createAdminToken();
  const csrf = await getAdminTokenCsrfToken({ token });
  return { token, csrf, cookie: `admin_token=${token}; admin_csrf=${csrf}` };
}

describe("admin session and CSRF enforcement", () => {
  beforeEach(async () => { await resetAdminAuthStateForTests(); });
  afterEach(() => vi.unstubAllEnvs());

  it("revokes an issued session immediately", async () => {
    const token = await createAdminToken();
    expect(await verifyAdminToken({ token })).toBe(true);
    expect(await getAdminTokenSessionId({ token })).toBeTruthy();
    await revokeAdminToken({ token });
    expect(await verifyAdminToken({ token })).toBe(false);
  });

  it("invalidates pre-enrollment password sessions as soon as a passkey is installed", async () => {
    const token = await createAdminToken();
    expect(await verifyAdminToken({ token })).toBe(true);
    await installPasskey({ id: "credential-one", publicKey: "AQID", counter: 0 }, []);
    expect(await verifyAdminToken({ token })).toBe(false);
  });

  it("does not allow a single-code recovery session to list other sessions", async () => {
    const token = await createAdminToken({ authMethod: "recovery" });
    await installPasskey({ id: "credential-one", publicKey: "AQID", counter: 0 }, []);
    const response = await listSessions(new Request("https://example.test/api/admin/sessions", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(response.status).toBe(403);
  });

  it("expires server-side sessions", async () => {
    const now = Date.now();
    const session = await createAdminSession(now, 2);
    expect(await readActiveSession(session.id, now + 1000)).not.toBeNull();
    expect(await readActiveSession(session.id, now + 2000)).toBeNull();
  });

  it("allows logout without CSRF material and revokes the active cookie session", async () => {
    const { token, cookie } = await createCookieSession();
    const response = await logout(new Request("https://example.test/api/admin/logout", { method: "POST", headers: { cookie } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("admin_token=;");
    expect(await verifyAdminToken({ token })).toBe(false);
  });

  it("requires origin and double-submit CSRF token for cookie mutations", async () => {
    const { csrf, cookie } = await createCookieSession();
    expect((await requireAdminAuth(new Request("https://example.test/api/admin/flags", { method: "POST", headers: { cookie } }))).status).toBe(403);
    expect((await requireAdminAuth(new Request("https://example.test/api/admin/flags", { method: "POST", headers: { cookie, origin: "https://attacker.test", "x-csrf-token": csrf! } }))).status).toBe(403);
    expect((await requireAdminAuth(new Request("https://example.test/api/admin/flags", { method: "POST", headers: { cookie, origin: "https://example.test", "x-csrf-token": csrf! } }))).ok).toBe(true);
  });

  it("keeps explicit bearer authentication available to API clients", async () => {
    const token = await createAdminToken();
    expect((await requireAdminAuth(new Request("https://example.test/api/admin/flags", { method: "POST", headers: { authorization: `Bearer ${token}` } }))).ok).toBe(true);
  });

  it("allows logout to revoke the presented bearer session", async () => {
    const token = await createAdminToken();
    const response = await logout(new Request("https://example.test/api/admin/logout", { method: "POST", headers: { authorization: `Bearer ${token}` } }));
    expect(response.status).toBe(200);
    expect(await verifyAdminToken({ token })).toBe(false);
  });

  it("rejects revoking the current session and directs the owner to logout", async () => {
    const { token, csrf, cookie } = await createCookieSession();
    const sessionId = await getAdminTokenSessionId({ token });
    const response = await revokeSession(new Request("https://example.test/api/admin/sessions", {
      method: "DELETE",
      headers: { cookie, origin: "https://example.test", "x-csrf-token": csrf!, "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }));
    expect(response.status).toBe(400);
    expect(await verifyAdminToken({ token })).toBe(true);
  });

  it("derives the CSRF origin from the request when production WebAuthn origin is unset", async () => {
    vi.stubEnv("ADMIN_WEBAUTHN_ORIGIN", "");
    const { token, csrf, cookie } = await createCookieSession();
    const response = await requireAdminAuth(new Request("https://example.test/api/admin/flags", {
      method: "POST",
      headers: { cookie, origin: "https://example.test", "x-csrf-token": csrf! },
    }));
    expect(response.ok).toBe(true);
  });

  it("uses the configured public CSRF origin when it differs from the WebAuthn origin", async () => {
    vi.stubEnv("ADMIN_CSRF_ORIGIN", "https://admin.example.test");
    const { csrf, cookie } = await createCookieSession();
    const response = await requireAdminAuth(new Request("https://worker.internal/api/admin/flags", {
      method: "POST",
      headers: { cookie, origin: "https://admin.example.test", "x-csrf-token": csrf! },
    }));
    expect(response.ok).toBe(true);
  });

  it("fails closed on an invalid configured origin without throwing", async () => {
    vi.stubEnv("ADMIN_WEBAUTHN_ORIGIN", "not a URL");
    const { csrf, cookie } = await createCookieSession();
    const response = await requireAdminAuth(new Request("https://example.test/api/admin/flags", {
      method: "POST",
      headers: { cookie, origin: "https://example.test", "x-csrf-token": csrf! },
    }));
    expect(response.status).toBe(403);
  });
});
