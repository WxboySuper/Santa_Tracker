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

    let bodyReads = 0;
    const lockedBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        bodyReads += 1;
        controller.enqueue(new TextEncoder().encode("not json"));
        controller.close();
      },
    }, { highWaterMark: 0 });
    const lockedMalformed = await POST(new Request("http://example.test/api/admin/login", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: lockedBody,
      duplex: "half",
    } as RequestInit & { duplex: "half" }));
    expect(lockedMalformed.status).toBe(429);
    expect(bodyReads).toBe(0);
  });

  it("rejects login JSON larger than 4 KiB without parsing it", async () => {
    const oversized = await POST(new Request("http://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.72", "content-type": "application/json" },
      body: JSON.stringify({ password: "x".repeat(5000) }),
    }));
    expect(oversized.status).toBe(413);
  });

  it("does not let one slow body read block a later same-IP login", async () => {
    let markBodyStarted: () => void = () => undefined;
    const bodyStarted = new Promise<void>((resolve) => { markBodyStarted = resolve; });
    const requestAbort = new AbortController();
    const slowBody = new ReadableStream<Uint8Array>({
      pull() {
        markBodyStarted();
        return new Promise<void>(() => undefined);
      },
    }, { highWaterMark: 0 });
    const stalled = POST(new Request("http://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.73", "content-type": "application/json" },
      body: slowBody,
      signal: requestAbort.signal,
      duplex: "half",
    } as RequestInit & { duplex: "half" }));
    await bodyStarted;
    const normal = POST(new Request("http://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.73", "content-type": "application/json" },
      body: JSON.stringify({ password: "correct horse" }),
    }));
    let timer: ReturnType<typeof setTimeout>;
    let normalStatus: number;
    try {
      normalStatus = await Promise.race([
        normal.then((response) => response.status),
        new Promise<number>((resolve) => { timer = setTimeout(() => resolve(0), 50); }),
      ]);
    } finally {
      clearTimeout(timer!);
      requestAbort.abort();
    }
    expect(normalStatus).toBe(200);
    expect((await stalled).status).toBe(408);
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

  it("bounds login queues for distinct IPs", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const requests = Array.from({ length: 256 }, (_, index) =>
      serializeLogin(`source-${index}`, () => gate.then(() => NextResponse.json({ ok: true }))),
    );
    try {
      const overflow = await serializeLogin("source-overflow", () => Promise.resolve(NextResponse.json({ ok: true })));
      expect(overflow.status).toBe(429);
    } finally {
      release();
      await Promise.all(requests);
    }
  });

  it("starts the processing timeout only when a queued login begins", async () => {
    let releaseFirst: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let timeoutStarts = 0;
    const first = serializeLogin("ip-timeout", () => gate.then(() => NextResponse.json({ ok: true })));
    const queued = serializeLogin(
      "ip-timeout",
      () => Promise.resolve(NextResponse.json({ ok: true })),
      undefined,
      () => { timeoutStarts += 1; },
    );
    try {
      expect(timeoutStarts).toBe(0);
    } finally {
      releaseFirst();
    }
    await Promise.all([first, queued]);
    expect(timeoutStarts).toBe(1);
  });

  it("returns a timeout when a login exceeds the separate queue wait limit", async () => {
    vi.useFakeTimers();
    let releaseFirst: () => void = () => undefined;
    let bodyCancelled = false;
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = serializeLogin("queue-wait-limit", () => gate.then(() => NextResponse.json({ ok: true })));
    const body = new ReadableStream<Uint8Array>({ cancel() { bodyCancelled = true; } }, { highWaterMark: 0 });
    const queued = POST(new Request("http://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "queue-wait-limit", "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" }));
    try {
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await queued).status).toBe(408);
      expect(bodyCancelled).toBe(true);
    } finally {
      releaseFirst();
      await first;
      await vi.runAllTimersAsync();
      vi.useRealTimers();
    }
  });

  it("abandons a stalled body read when the request is aborted", async () => {
    let releaseBody: () => void = () => undefined;
    let releaseCancel: () => void = () => undefined;
    const bodyStarted = new Promise<void>((resolve) => { releaseBody = resolve; });
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(streamController) { controller = streamController; },
      pull() { releaseBody(); },
      cancel() { return new Promise<void>((resolve) => { releaseCancel = resolve; }); },
    }, { highWaterMark: 0 });
    const requestAbort = new AbortController();
    const stalledRequest = POST(new Request("http://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.74", "content-type": "application/json" },
      body,
      signal: requestAbort.signal,
      duplex: "half",
    } as RequestInit & { duplex: "half" }));
    await bodyStarted;
    requestAbort.abort();
    let timeout: ReturnType<typeof setTimeout>;
    const result = await Promise.race([
      stalledRequest.then((response) => response.status),
      new Promise<number>((resolve) => { timeout = setTimeout(() => resolve(0), 50); }),
    ]);
    clearTimeout(timeout!);
    if (result === 0) controller?.error(new Error("Test cleanup"));
    releaseCancel();
    expect(result).toBe(408);
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
