import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createAdminSession, readActiveSession, resetAdminAuthStateForTests } from "./admin-auth-state";
import { createAdminToken, getAdminTokenCsrfToken, getAdminTokenSessionId, requireAdminAuth, revokeAdminToken, verifyAdminToken } from "./auth";
import { POST as logout } from "@/app/api/admin/logout/route";
import { DELETE as revokeSession } from "@/app/api/admin/sessions/route";

describe("admin session and CSRF enforcement", () => {
  beforeEach(async () => { await resetAdminAuthStateForTests(); });
  afterEach(() => vi.unstubAllEnvs());

  it("revokes an issued session immediately", async () => {
    const token = await createAdminToken();
    expect(await verifyAdminToken(token)).toBe(true);
    expect(await getAdminTokenSessionId(token)).toBeTruthy();
    await revokeAdminToken(token);
    expect(await verifyAdminToken(token)).toBe(false);
  });

  it("expires server-side sessions", async () => {
    const now = Date.now();
    const session = await createAdminSession(now, 2);
    expect(await readActiveSession(session.id, now + 1000)).not.toBeNull();
    expect(await readActiveSession(session.id, now + 2000)).toBeNull();
  });

  it("requires CSRF to log out an active cookie session and then revokes it", async () => {
    const token = await createAdminToken();
    const csrf = await getAdminTokenCsrfToken(token);
    const denied = await logout(new Request("https://example.test/api/admin/logout", { method: "POST", headers: { cookie: `admin_token=${token}; admin_csrf=${csrf}` } }));
    expect(denied.status).toBe(403);
    const accepted = await logout(new Request("https://example.test/api/admin/logout", {
      method: "POST",
      headers: { cookie: `admin_token=${token}; admin_csrf=${csrf}`, origin: "https://example.test", "x-csrf-token": csrf! },
    }));
    expect(accepted.status).toBe(200);
    expect(await verifyAdminToken(token)).toBe(false);
  });

  it("requires origin and double-submit CSRF token for cookie mutations", async () => {
    const token = await createAdminToken();
    const csrf = await getAdminTokenCsrfToken(token);
    const cookie = `admin_token=${token}; admin_csrf=${csrf}`;
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
    expect(await verifyAdminToken(token)).toBe(false);
  });

  it("rejects revoking the current session and directs the owner to logout", async () => {
    const token = await createAdminToken();
    const csrf = await getAdminTokenCsrfToken(token);
    const sessionId = await getAdminTokenSessionId(token);
    const response = await revokeSession(new Request("https://example.test/api/admin/sessions", {
      method: "DELETE",
      headers: { cookie: `admin_token=${token}; admin_csrf=${csrf}`, origin: "https://example.test", "x-csrf-token": csrf!, "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }));
    expect(response.status).toBe(400);
    expect(await verifyAdminToken(token)).toBe(true);
  });

  it("derives the CSRF origin from the request when production WebAuthn origin is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_WEBAUTHN_ORIGIN", "");
    const token = await createAdminToken();
    const csrf = await getAdminTokenCsrfToken(token);
    const response = await requireAdminAuth(new Request("https://example.test/api/admin/flags", {
      method: "POST",
      headers: { cookie: `admin_token=${token}; admin_csrf=${csrf}`, origin: "https://example.test", "x-csrf-token": csrf! },
    }));
    expect(response.ok).toBe(true);
  });
});
