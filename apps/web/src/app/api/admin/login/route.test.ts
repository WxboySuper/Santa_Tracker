import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as jose from "jose";
import { ADMIN_SESSION_TTL_SECONDS, shouldUseSecureAdminCookie } from "@/lib/auth";
import { getClientIp, POST } from "./route";
import { POST as logout } from "../logout/route";

describe("admin login route", () => {
  beforeEach(() => {
    vi.stubEnv("SECRET_KEY", "test-secret-key-0123456789abcdef-0123456789");
    vi.stubEnv("ADMIN_PASSWORD", "correct horse");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("prefers Cloudflare IP, falls back to real IP, and ignores forwarded-for", () => {
    expect(getClientIp(new Request("http://example.test", { headers: {
      "cf-connecting-ip": "203.0.113.1", "x-real-ip": "203.0.113.2", "x-forwarded-for": "203.0.113.3",
    } }))).toBe("203.0.113.1");
    expect(getClientIp(new Request("http://example.test", { headers: { "x-real-ip": "203.0.113.2", "x-forwarded-for": "203.0.113.3" } }))).toBe("203.0.113.2");
    expect(getClientIp(new Request("http://example.test", { headers: { "x-forwarded-for": "203.0.113.3" } }))).toBe("unknown");
    vi.stubEnv("NODE_ENV", "production");
    expect(getClientIp(new Request("http://example.test", { headers: { "x-forwarded-for": "203.0.113.3" } }))).toBeNull();
  });

  it("locks after five failures, ignores spoofed forwarded-for, and hides password correctness", async () => {
    const commonHeaders = { "cf-connecting-ip": "198.51.100.50", "content-type": "application/json" };
    for (let index = 0; index < 4; index += 1) {
      const response = await POST(new Request("http://example.test/api/admin/login", {
        method: "POST", headers: { ...commonHeaders, "x-forwarded-for": `192.0.2.${index}` },
        body: JSON.stringify({ password: "wrong" }),
      }));
      expect(response.status).toBe(401);
    }
    const locked = await POST(new Request("http://example.test/api/admin/login", {
      method: "POST", headers: { ...commonHeaders, "x-forwarded-for": "192.0.2.5" },
      body: JSON.stringify({ password: "wrong" }),
    }));
    expect(locked.status).toBe(429);
    expect(locked.headers.get("Retry-After")).toBe("900");
    const lockedBody = await locked.json();
    const correct = await POST(new Request("http://example.test/api/admin/login", {
      method: "POST", headers: { ...commonHeaders, "x-forwarded-for": "192.0.2.6" },
      body: JSON.stringify({ password: "correct horse" }),
    }));
    expect(correct.status).toBe(429);
    expect(await correct.json()).toEqual(lockedBody);
  });

  it("checks the lockout before reading the request body", async () => {
    const headers = { "cf-connecting-ip": "198.51.100.51", "content-type": "application/json" };
    for (let index = 0; index < 5; index += 1) {
      await POST(new Request("http://example.test/api/admin/login", {
        method: "POST", headers, body: JSON.stringify({ password: "wrong" }),
      }));
    }
    let bodyReads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        bodyReads += 1;
        controller.enqueue(new TextEncoder().encode("not json"));
        controller.close();
      },
    }, { highWaterMark: 0 });
    const response = await POST(new Request("http://example.test/api/admin/login", {
      method: "POST", headers, body, duplex: "half",
    } as RequestInit & { duplex: "half" }));
    expect(response.status).toBe(429);
    expect(bodyReads).toBe(0);
  });

  it("rejects JSON larger than 4 KiB", async () => {
    const response = await POST(new Request("http://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.52", "content-type": "application/json" },
      body: JSON.stringify({ password: "x".repeat(5000) }),
    }));
    expect(response.status).toBe(413);
  });

  it("allows only one same-IP password check at a time", async () => {
    const requests = Array.from({ length: 20 }, () => POST(new Request("http://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.53", "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    })));
    const responses = await Promise.all(requests);
    expect(responses.filter((response) => response.status === 401)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(19);
    expect(responses.filter((response) => response.status === 429).every((response) => response.headers.get("Retry-After") === "1")).toBe(true);
  });

  it("does not globally lock out distinct IPs", async () => {
    for (let index = 0; index < 31; index += 1) {
      const response = await POST(new Request("http://example.test/api/admin/login", {
        method: "POST",
        headers: { "cf-connecting-ip": `198.51.100.${index + 1}`, "content-type": "application/json" },
        body: JSON.stringify({ password: "wrong" }),
      }));
      expect(response.status).toBe(401);
    }
    const success = await POST(new Request("http://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.75", "content-type": "application/json", "x-forwarded-proto": "https" },
      body: JSON.stringify({ password: "correct horse" }),
    }));
    expect(success.status).toBe(200);
    expect(success.headers.get("set-cookie")).toContain("Secure");
  });

  it("uses forwarded HTTPS for matching login and logout cookie attributes", async () => {
    expect(shouldUseSecureAdminCookie(new Request("http://internal.example.test", { headers: { "x-forwarded-proto": "http" } }))).toBe(false);
    const request = new Request("http://internal.example.test/api/admin/login", {
      method: "POST", headers: { "cf-connecting-ip": "198.51.100.60", "content-type": "application/json", "x-forwarded-proto": "https, http" },
      body: JSON.stringify({ password: "correct horse" }),
    });
    const response = await POST(request);
    const loginCookie = response.headers.get("set-cookie") ?? "";
    expect(loginCookie).toContain("Max-Age=43200");
    expect(loginCookie).toContain("HttpOnly");
    expect(loginCookie).toContain("SameSite=lax");
    expect(loginCookie).toContain("Secure");
    expect(loginCookie).toContain("Path=/");

    const clear = logout(new Request("http://internal.example.test/api/admin/logout", {
      method: "POST", headers: { "x-forwarded-proto": "https" },
    }));
    const logoutCookie = clear.headers.get("set-cookie") ?? "";
    expect(logoutCookie).toContain("Max-Age=0");
    expect(logoutCookie).toContain("HttpOnly");
    expect(logoutCookie).toContain("SameSite=lax");
    expect(logoutCookie).toContain("Secure");
    expect(logoutCookie).toContain("Path=/");
  });

  it("uses the shared 12-hour constant for JWT expiry and cookie lifetime", async () => {
    expect(ADMIN_SESSION_TTL_SECONDS).toBe(12 * 60 * 60);
    const response = await POST(new Request("https://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.61", "content-type": "application/json" },
      body: JSON.stringify({ password: "correct horse" }),
    }));
    const token = (await response.json() as { token: string }).token;
    const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(process.env.SECRET_KEY!));
    expect(payload.exp! - payload.iat!).toBe(ADMIN_SESSION_TTL_SECONDS);
    expect(response.headers.get("set-cookie")).toContain(`Max-Age=${ADMIN_SESSION_TTL_SECONDS}`);
  });
});
