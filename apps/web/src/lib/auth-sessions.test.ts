import { describe, expect, it, beforeEach } from "vitest";
import { createAdminSession, readActiveSession, resetAdminAuthStateForTests } from "./admin-auth-state";
import { createAdminToken, getAdminTokenCsrfToken, getAdminTokenSessionId, requireAdminAuth, revokeAdminToken, verifyAdminToken } from "./auth";
import { POST as logout } from "@/app/api/admin/logout/route";

describe("admin session and CSRF enforcement", () => {
  beforeEach(async () => { await resetAdminAuthStateForTests(); });

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
});
