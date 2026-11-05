import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminToken } from "../auth";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined) }),
}));

const { canViewFeature, closedResponse, featureAccess, gatedFeature } = await import("../access");

const CLOSED = new Date("2026-11-05T12:00:00Z");
const OPEN_TRACKER = new Date("2026-12-24T12:00:00Z");

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/thing", { headers });
}

beforeEach(() => {
  vi.stubEnv("SECRET_KEY", "test-secret-key-0123456789abcdef-0123456789");
  vi.stubEnv("SEASON_OVERRIDE", "");
  cookieJar.clear();
  vi.useFakeTimers();
  vi.setSystemTime(CLOSED);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("featureAccess", () => {
  it("is closed to anonymous requests outside the window", async () => {
    expect(await featureAccess("tracker", request())).toBe("closed");
    expect(await featureAccess("advent", request())).toBe("closed");
  });

  it("is open to everyone inside the window", async () => {
    expect(await featureAccess("tracker", request(), OPEN_TRACKER)).toBe("open");
  });

  it("lets a valid admin bearer token through a closed window", async () => {
    const token = await createAdminToken();
    expect(await featureAccess("tracker", request({ authorization: `Bearer ${token}` }))).toBe("admin");
  });

  it("lets a valid admin cookie through a closed window", async () => {
    const token = await createAdminToken();
    expect(await featureAccess("advent", request({ cookie: `admin_token=${token}` }))).toBe("admin");
  });

  it("does not let a forged or malformed token through", async () => {
    expect(await featureAccess("tracker", request({ authorization: "Bearer not-a-real-token" }))).toBe("closed");
    expect(await featureAccess("tracker", request({ cookie: "admin_token=garbage" }))).toBe("closed");
  });

  it("opens everything with SEASON_OVERRIDE=open", async () => {
    vi.stubEnv("SEASON_OVERRIDE", "open");
    expect(await featureAccess("tracker", request())).toBe("open");
    expect(await featureAccess("advent", request())).toBe("open");
  });
});

describe("gatedFeature", () => {
  const handler = vi.fn(async () => Response.json({ ok: true }, { headers: { "Cache-Control": "public, s-maxage=60" } }));

  beforeEach(() => handler.mockClear());

  it("answers 404 with no-store and never runs the handler while closed", async () => {
    const response = await gatedFeature("tracker", handler)(request(), undefined);
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler and keeps its own cache header when open", async () => {
    vi.setSystemTime(OPEN_TRACKER);
    const response = await gatedFeature("tracker", handler)(request(), undefined);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=60");
  });

  it("forces no-store on an admin response through a closed gate so it cannot be cached for visitors", async () => {
    const token = await createAdminToken();
    const response = await gatedFeature("tracker", handler)(request({ authorization: `Bearer ${token}` }), undefined);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("closedResponse", () => {
  it("is an uncacheable JSON 404", async () => {
    const response = closedResponse();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "Not found" });
  });
});

describe("canViewFeature (pages)", () => {
  it("hides a closed feature from a visitor with no session", async () => {
    expect(await canViewFeature("advent")).toBe(false);
  });

  it("shows a closed feature to a valid admin session cookie", async () => {
    cookieJar.set("admin_token", await createAdminToken());
    expect(await canViewFeature("advent")).toBe(true);
  });

  it("hides a closed feature from a forged session cookie", async () => {
    cookieJar.set("admin_token", "forged");
    expect(await canViewFeature("advent")).toBe(false);
  });

  it("shows an open feature to everyone", async () => {
    expect(await canViewFeature("tracker", OPEN_TRACKER)).toBe(true);
  });
});
