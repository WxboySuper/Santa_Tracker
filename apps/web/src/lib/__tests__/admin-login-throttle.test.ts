import { describe, expect, it } from "vitest";
import { createLoginThrottle, InMemoryThrottleStore } from "../admin-login-throttle";

const MINUTE = 60_000;

function setup() {
  let now = 0;
  const throttle = createLoginThrottle(new InMemoryThrottleStore(), () => now);
  return { throttle, advance: (milliseconds: number) => { now += milliseconds; } };
}

describe("admin login throttle", () => {
  it("slides the per-IP window as earlier failures expire", async () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 4; i += 1) await throttle.recordFailure("ip-a");
    advance(15 * MINUTE + 1);
    await throttle.recordFailure("ip-a");
    expect(await throttle.check("ip-a")).toBeNull();
  });

  it("locks the fifth failure for 15 minutes and doubles repeated lockouts up to one hour", async () => {
    const { throttle, advance } = setup();
    let decision: Awaited<ReturnType<typeof throttle.recordFailure>> = null;
    for (let i = 0; i < 5; i += 1) decision = await throttle.recordFailure("ip-a");
    expect(decision).toEqual({ retryAfterSeconds: 900, reason: "ip" });
    expect(await throttle.check("ip-a")).toEqual({ retryAfterSeconds: 900, reason: "ip" });
    advance(15 * MINUTE);
    for (let i = 0; i < 5; i += 1) decision = await throttle.recordFailure("ip-a");
    expect(decision).toEqual({ retryAfterSeconds: 1800, reason: "ip" });
    advance(30 * MINUTE);
    for (let i = 0; i < 5; i += 1) decision = await throttle.recordFailure("ip-a");
    expect(decision).toEqual({ retryAfterSeconds: 3600, reason: "ip" });
    advance(60 * MINUTE);
    for (let i = 0; i < 5; i += 1) decision = await throttle.recordFailure("ip-a");
    expect(decision).toEqual({ retryAfterSeconds: 3600, reason: "ip" });
  });

  it("caps distributed failures after more than 30 in one hour", async () => {
    const { throttle } = setup();
    let decision: Awaited<ReturnType<typeof throttle.recordFailure>> = null;
    for (let i = 0; i < 31; i += 1) decision = await throttle.recordFailure(`ip-${i}`);
    expect(decision?.reason).toBe("global");
    expect((await throttle.check("new-ip"))?.reason).toBe("global");
    expect(await throttle.check("new-ip", true)).toBeNull();
  });

  it("counts simultaneous failures from different IPs toward the global cap", async () => {
    const { throttle } = setup();
    await Promise.all(Array.from({ length: 31 }, (_, index) => throttle.recordFailure(`parallel-${index}`)));
    expect((await throttle.check("new-ip"))?.reason).toBe("global");
  });

  it("does not add more global failures from an already locked IP", async () => {
    const { throttle } = setup();
    for (let i = 0; i < 5; i += 1) await throttle.recordFailure("locked-ip");
    for (let i = 0; i < 25; i += 1) await throttle.recordFailure(`other-${i}`);
    for (let i = 0; i < 5; i += 1) await throttle.recordFailure("locked-ip");
    expect(await throttle.check("new-ip")).toBeNull();
    expect((await throttle.recordFailure("last-ip"))?.reason).toBe("global");
  });

  it("keeps the global cap bypass for authenticated failed logins", async () => {
    const { throttle } = setup();
    for (let i = 0; i < 31; i += 1) await throttle.recordFailure(`ip-${i}`);
    expect(await throttle.recordFailure("authenticated-ip", true)).toBeNull();
    expect((await throttle.check("new-ip"))?.reason).toBe("global");
  });

  it("clears an IP's counter on successful login and expires global failures after an hour", async () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 4; i += 1) await throttle.recordFailure("ip-a");
    await throttle.clear("ip-a");
    expect(await throttle.check("ip-a")).toBeNull();
    for (let i = 0; i < 31; i += 1) await throttle.recordFailure(`global-${i}`);
    advance(60 * MINUTE + 1);
    expect(await throttle.check("new-ip")).toBeNull();
  });

  it("bounds in-memory keys while preserving the global counter and recently used IPs", async () => {
    const store = new InMemoryThrottleStore(3);
    const state = { attempts: [1], lockoutUntil: 0, lockoutLevel: 0, lastLockoutAt: -1 };
    await store.set("global", state);
    await store.set("ip:old", state);
    await store.set("ip:recent", state);
    await store.get("ip:old");
    await store.set("ip:new", state);
    expect(await store.get("global")).toEqual(state);
    expect(await store.get("ip:old")).toEqual(state);
    expect(await store.get("ip:new")).toEqual(state);
    expect(await store.get("ip:recent")).toBeUndefined();
  });
});
