import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import * as jose from "jose";
import { ADMIN_SESSION_TTL_SECONDS, shouldUseSecureAdminCookie } from "@/lib/auth";
import { getClientIp, POST, serializeLogin } from "./route";
import { POST as logout } from "../logout/route";

describe("admin login route", () => {
  beforeEach(() => {
    vi.stubEnv("SECRET_KEY", "test-secret-key-0123456789abcdef-0123456789");
    vi.stubEnv("ADMIN_PASSWORD", "correct horse");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("prefers Cloudflare IP, then real IP, and ignores forwarded-for", () => {
    expect(getClientIp(new Request("http://example.test", { headers: {
      "cf-connecting-ip": "203.0.113.1", "x-real-ip": "203.0.113.2", "x-forwarded-for": "203.0.113.3",
    } }))).toBe("203.0.113.1");
    expect(getClientIp(new Request("http://example.test", { headers: { "x-real-ip": "203.0.113.2", "x-forwarded-for": "203.0.113.3" } }))).toBe("203.0.113.2");
    expect(getClientIp(new Request("http://example.test", { headers: { "x-forwarded-for": "203.0.113.3" } }))).toBe("unknown");
  });

  it("returns the same 429 response for the fifth failure and refuses a correct password while locked", async () => {
    const headers = { "cf-connecting-ip": "198.51.100.50", "x-forwarded-for": "192.0.2.1" };
    let response: Response | undefined;
    for (let i = 0; i < 5; i += 1) {
      response = await POST(new Request("http://example.test/api/admin/login", {
        method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ password: "wrong" }),
      }));
    }
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("900");
    expect(await response?.json()).toEqual({ error: "Too many login attempts, please try again later" });
    const correct = await POST(new Request("http://example.test/api/admin/login", {
      method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ password: "correct horse" }),
    }));
    expect(correct.status).toBe(429);
    expect(correct.headers.get("Retry-After")).toBe("900");
  });

  it("serializes concurrent failures so only four requests receive 401", async () => {
    const requests = Array.from({ length: 20 }, (_, index) => POST(new Request("http://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.70", "x-forwarded-for": `192.0.2.${index}`, "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    })));
    const responses = await Promise.all(requests);
    expect(responses.filter((response) => response.status === 401)).toHaveLength(4);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(16);
  });

  it("bounds the number of login requests waiting in the queue", async () => {
    const requests = Array.from({ length: 70 }, (_, index) => POST(new Request("http://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.71", "content-type": "application/json" },
      body: JSON.stringify({ password: `wrong-${index}` }),
    })));
    const responses = await Promise.all(requests);
    expect(responses.filter((response) => response.headers.get("Retry-After") === "1")).toHaveLength(6);
  });

  it("does not let one IP's full queue reject a different IP", async () => {
    let releaseFirst: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const response = () => Promise.resolve(NextResponse.json({ ok: true }));
    const first = serializeLogin("ip-a", () => gate.then(() => NextResponse.json({ ok: true })));
    const queued = Array.from({ length: 63 }, () => serializeLogin("ip-a", response));
    try {
      const sameIpOverflow = await serializeLogin("ip-a", response);
      const otherIpResponse = await serializeLogin("ip-b", response);
      expect(sameIpOverflow.status).toBe(429);
      expect(otherIpResponse.status).toBe(200);
    } finally {
      releaseFirst();
      await Promise.all([first, ...queued]);
    }
  });

  it("sets Secure for production requests even if an internal URL is HTTP", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(shouldUseSecureAdminCookie(new Request("http://internal.example.test"))).toBe(true);
  });

  it("clears the cookie with the same production Secure and path attributes", () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = logout(new Request("http://internal.example.test/api/admin/logout", { method: "POST" }));
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
  });

  it("uses one 12-hour constant for JWT expiry and the HTTPS cookie", async () => {
    const response = await POST(new Request("https://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.60", "content-type": "application/json" },
      body: JSON.stringify({ password: "correct horse" }),
    }));
    expect(response.status).toBe(200);
    const token = (await response.json() as { token: string }).token;
    const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(process.env.SECRET_KEY!));
    expect(payload.exp! - payload.iat!).toBe(ADMIN_SESSION_TTL_SECONDS);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("Max-Age=43200");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
  });
});
