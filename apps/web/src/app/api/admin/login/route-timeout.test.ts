import { afterEach, describe, expect, it, vi } from "vitest";
import { loginAdmin, recordLoginAttempt } from "@/lib/admin-login";
import { POST } from "./route";

vi.mock("@/lib/admin-login", () => ({
  checkLoginRateLimit: vi.fn(async () => null),
  clearLoginAttempts: vi.fn(async () => undefined),
  loginAdmin: vi.fn(),
  recordLoginAttempt: vi.fn(async () => null),
}));

describe("admin login processing timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it("times out a pending verification without counting it as a password failure", async () => {
    vi.useFakeTimers();
    vi.stubEnv("SECRET_KEY", "test-secret-key-0123456789abcdef-0123456789");
    vi.stubEnv("ADMIN_PASSWORD", "correct horse");
    let finishLogin: ((result: Awaited<ReturnType<typeof loginAdmin>>) => void) | undefined;
    vi.mocked(loginAdmin).mockImplementation(() => new Promise((resolve) => { finishLogin = resolve; }));
    const request = POST(new Request("http://example.test/api/admin/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.81", "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    }));

    await vi.advanceTimersByTimeAsync(0);
    expect(loginAdmin).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);

    expect((await request).status).toBe(408);
    expect(recordLoginAttempt).not.toHaveBeenCalled();
    finishLogin?.({ status: 401, body: { error: "Invalid password" } });
    await Promise.resolve();
    await Promise.resolve();
  });

  it("bounds verification work that continues after a request timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("SECRET_KEY", "test-secret-key-0123456789abcdef-0123456789");
    vi.stubEnv("ADMIN_PASSWORD", "correct horse");
    let finishLogin: ((result: Awaited<ReturnType<typeof loginAdmin>>) => void) | undefined;
    vi.mocked(loginAdmin).mockImplementation(() => new Promise((resolve) => { finishLogin = resolve; }));
    const requestOptions = {
      method: "POST",
      headers: { "cf-connecting-ip": "198.51.100.82", "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    };

    const firstRequest = POST(new Request("http://example.test/api/admin/login", requestOptions));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await firstRequest).status).toBe(408);

    const overlappingRequest = await POST(new Request("http://example.test/api/admin/login", requestOptions));
    expect(overlappingRequest.status).toBe(429);
    expect(loginAdmin).toHaveBeenCalledOnce();

    finishLogin?.({ status: 401, body: { error: "Invalid password" } });
    await Promise.resolve();
    await Promise.resolve();
  });
});
