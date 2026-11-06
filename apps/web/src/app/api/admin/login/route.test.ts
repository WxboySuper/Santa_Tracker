import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as jose from "jose";
import * as adminLogin from "@/lib/admin-login";
import * as auth from "@/lib/auth";
import { ADMIN_SESSION_TTL_SECONDS, shouldUseSecureAdminCookie } from "@/lib/auth";
import { getClientIp, POST } from "./route";
import { POST as logout } from "../logout/route";

describe("admin login route", () => {
  beforeEach(() => {
    vi.stubEnv("SECRET_KEY", "test-secret-key-0123456789abcdef-0123456789");
    vi.stubEnv("ADMIN_PASSWORD", "correct horse");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("prefers Cloudflare IP, falls back to real IP, and ignores forwarded-for", () => {
    expect(getClientIp(new Request("http://example.test", { headers: {
      "cf-connecting-ip": "203.0.113.1", "x-real-ip": "203.0.113.2", "x-forwarded-for": "203.0.113.3",
    } }))).toBe("203.0.113.1");
    expect(getClientIp(new Request("http://example.test", { headers: { "x-real-ip": "203.0.113.2", "x-forwarded-for": "203.0.113.3" } }))).toBe("203.0.113.2");
    expect(getClientIp(new Request("http://example.test", { headers: { "x-forwarded-for": "203.0.113.3" } }))).toBe("unknown");
    expect(getClientIp(new Request("http://example.test", { headers: { "cf-connecting-ip": "2001:0DB8:0:0::1" } }))).toBe("2001:db8::1");
    expect(getClientIp(new Request("http://example.test", { headers: { "cf-connecting-ip": "not-an-ip", "x-real-ip": "203.0.113.4" } }))).toBe("203.0.113.4");
    expect(getClientIp(new Request("http://example.test", { headers: { "cf-connecting-ip": "x".repeat(46) } }))).toBe("unknown");
    vi.stubEnv("NODE_ENV", "production");
    expect(getClientIp(new Request("http://example.test", { headers: { "x-forwarded-for": "203.0.113.3" } }))).toBeNull();
    expect(getClientIp(new Request("http://example.test", { headers: { "cf-connecting-ip": "x".repeat(46) } }))).toBeNull();
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

  it("does not count malformed JSON as a failed password attempt", async () => {
    const headers = { "cf-connecting-ip": "198.51.100.54", "content-type": "application/json" };
    for (let index = 0; index < 4; index += 1) {
      const response = await POST(new Request("http://example.test/api/admin/login", {
        method: "POST", headers, body: JSON.stringify({ password: "wrong" }),
      }));
      expect(response.status).toBe(401);
    }
    const malformed = await POST(new Request("http://example.test/api/admin/login", {
      method: "POST", headers, body: "{",
    }));
    expect(malformed.status).toBe(400);

    const fifthFailure = await POST(new Request("http://example.test/api/admin/login", {
      method: "POST", headers, body: JSON.stringify({ password: "wrong" }),
    }));
    expect(fifthFailure.status).toBe(429);
    expect(fifthFailure.headers.get("Retry-After")).toBe("900");
  });

  it("counts simultaneous same-IP failures without losing throttle updates", async () => {
    const verifyPassword = vi.spyOn(auth, "verifyAdminPassword");
    const requests = Array.from({ length: 20 }, () => POST(new Request("http://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.53", "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    })));
    const responses = await Promise.all(requests);
    expect(responses.filter((response) => response.status === 401)).toHaveLength(4);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(16);
    expect(responses.filter((response) => response.status === 429).every((response) => response.headers.get("Retry-After") === "900")).toBe(true);
    expect(verifyPassword).toHaveBeenCalledTimes(5);
  });

  it("refuses a successful password if the IP locks while its token is being signed", async () => {
    let finishSigning: ((token: string) => void) | undefined;
    const signing = vi.spyOn(auth, "createAdminToken").mockImplementation(() => new Promise((resolve) => {
      finishSigning = resolve;
    }));
    const headers = { "cf-connecting-ip": "198.51.100.65", "content-type": "application/json" };
    const pendingLogin = POST(new Request("https://example.test/api/admin/login", {
      method: "POST", headers, body: JSON.stringify({ password: "correct horse" }),
    }));
    await vi.waitFor(() => expect(signing).toHaveBeenCalledOnce());

    const failures: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const response = await POST(new Request("https://example.test/api/admin/login", {
        method: "POST", headers, body: JSON.stringify({ password: "wrong" }),
      }));
      failures.push(response.status);
    }
    expect(failures).toEqual([401, 401, 401, 401, 429]);
    if (!finishSigning) throw new Error("Token signing did not start");
    finishSigning("late-token");

    const response = await pendingLogin;
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
  });

  it("counts an asynchronous password failure toward the per-IP lockout", async () => {
    const login = vi.spyOn(adminLogin, "loginAdmin").mockResolvedValue({ status: 401, body: { error: "Invalid password" } });
    const headers = { "cf-connecting-ip": "198.51.100.66", "content-type": "application/json" };
    const statuses: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const response = await POST(new Request("https://example.test/api/admin/login", {
        method: "POST", headers, body: JSON.stringify({ password: "wrong" }),
      }));
      statuses.push(response.status);
    }

    expect(statuses).toEqual([401, 401, 401, 401, 429]);
    expect(login).toHaveBeenCalledTimes(5);
  });

  it("rechecks an async throttle store after the body is read", async () => {
    vi.spyOn(adminLogin, "checkLoginRateLimit")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ retryAfterSeconds: 60 });
    vi.spyOn(adminLogin, "checkLoginRateLimitNow").mockReturnValue(undefined);
    const verifyPassword = vi.spyOn(auth, "verifyAdminPassword");
    const response = await POST(new Request("https://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.67", "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(verifyPassword).not.toHaveBeenCalled();
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
    expect(shouldUseSecureAdminCookie()).toBe(true);
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

  it("keeps a secure login cookie clearable if the logout request scheme differs", async () => {
    const login = await POST(new Request("http://internal.example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.63", "content-type": "application/json", "x-forwarded-proto": "https" },
      body: JSON.stringify({ password: "correct horse" }),
    }));
    const logoutResponse = logout(new Request("http://internal.example.test/api/admin/logout", { method: "POST" }));

    expect(login.headers.get("set-cookie")).toContain("Secure");
    expect(logoutResponse.headers.get("set-cookie")).toContain("Secure");
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

  it("lets an authenticated owner re-login and refresh the session", async () => {
    const headers = { "cf-connecting-ip": "198.51.100.62", "content-type": "application/json" };
    const firstLogin = await POST(new Request("https://example.test/api/admin/login", {
      method: "POST", headers, body: JSON.stringify({ password: "correct horse" }),
    }));
    const firstToken = (await firstLogin.json() as { token: string }).token;

    const refreshed = await POST(new Request("https://example.test/api/admin/login", {
      method: "POST",
      headers: { ...headers, authorization: `Bearer ${firstToken}` },
      body: JSON.stringify({ password: "correct horse" }),
    }));

    expect(refreshed.status).toBe(200);
    expect(refreshed.headers.get("set-cookie")).toContain("admin_token=");
    expect(refreshed.headers.get("set-cookie")).toContain(`Max-Age=${ADMIN_SESSION_TTL_SECONDS}`);
  });

  it("returns a server error when token signing fails", async () => {
    vi.spyOn(auth, "createAdminToken").mockRejectedValue(new Error("signing failed"));
    const response = await POST(new Request("https://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.64", "content-type": "application/json" },
      body: JSON.stringify({ password: "correct horse" }),
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to create session" });
  });
});
