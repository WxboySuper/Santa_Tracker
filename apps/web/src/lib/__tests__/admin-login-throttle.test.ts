import { describe, expect, it } from "vitest";
import { createLoginThrottle, InMemoryThrottleStore } from "../admin-login-throttle";

const MINUTE = 60_000;

function setup(maxEntries = 10_000) {
  let now = 0;
  const store = new InMemoryThrottleStore({ maxEntries, clock: () => now });
  const throttle = createLoginThrottle(store, () => now);
  return { throttle, store, advance: (milliseconds: number) => { now += milliseconds; } };
}

describe("admin login throttle", () => {
  it("slides the per-IP window as earlier failures expire", async () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 4; i += 1) await throttle.recordFailure("ip-a");
    advance(15 * MINUTE + 1);
    await throttle.recordFailure("ip-a");
    expect(await throttle.check("ip-a")).toBeNull();
  });

  it("locks after five failures and doubles repeated lockouts up to one hour", async () => {
    const { throttle, advance } = setup();
    let decision: Awaited<ReturnType<typeof throttle.recordFailure>> = null;
    for (let i = 0; i < 5; i += 1) decision = await throttle.recordFailure("ip-a");
    expect(decision).toEqual({ retryAfterSeconds: 900 });
    expect(await throttle.check("ip-a")).toEqual({ retryAfterSeconds: 900 });
    advance(15 * MINUTE);
    for (let i = 0; i < 5; i += 1) decision = await throttle.recordFailure("ip-a");
    expect(decision).toEqual({ retryAfterSeconds: 1800 });
    advance(30 * MINUTE);
    for (let i = 0; i < 5; i += 1) decision = await throttle.recordFailure("ip-a");
    expect(decision).toEqual({ retryAfterSeconds: 3600 });
    advance(60 * MINUTE);
    for (let i = 0; i < 5; i += 1) decision = await throttle.recordFailure("ip-a");
    expect(decision).toEqual({ retryAfterSeconds: 3600 });
  });

  it("counts simultaneous failures without losing same-IP updates", async () => {
    const { throttle } = setup();
    await Promise.all(Array.from({ length: 5 }, () => throttle.recordFailure("ip-a")));
    expect(await throttle.check("ip-a")).toEqual({ retryAfterSeconds: 900 });
  });

  it("clears an IP's attempts and lockout history after successful login", async () => {
    const { throttle } = setup();
    for (let i = 0; i < 4; i += 1) await throttle.recordFailure("ip-a");
    await throttle.clear("ip-a");
    expect(await throttle.check("ip-a")).toBeNull();
    for (let i = 0; i < 5; i += 1) await throttle.recordFailure("ip-a");
    expect(await throttle.check("ip-a")).toEqual({ retryAfterSeconds: 900 });
  });

  it("resets escalation after a day without another lockout", async () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 5; i += 1) await throttle.recordFailure("ip-a");
    advance(24 * 60 * MINUTE);
    for (let i = 0; i < 5; i += 1) await throttle.recordFailure("ip-a");
    expect(await throttle.check("ip-a")).toEqual({ retryAfterSeconds: 900 });
  });

  it("evicts the least-recent non-locked IP before refusing a new IP", async () => {
    const now = 1000;
    const store = new InMemoryThrottleStore({ maxEntries: 3, clock: () => now });
    const state = (timestamp: number) => ({ attempts: [timestamp], lockoutUntil: 0, lockoutLevel: 0, lastLockoutAt: -1 });
    await store.set("ip:older", state(now - 100));
    await store.set("ip:middle", state(now - 50));
    await store.set("ip:recent", state(now));
    const throttle = createLoginThrottle(store, () => now);

    expect(await throttle.recordFailure("new")).toBeNull();
    expect(await store.get("ip:older")).toBeUndefined();
    expect(await store.get("ip:recent")).toBeDefined();
    expect(await store.get("ip:new")).toBeDefined();
  });

  it("preserves every active lockout and fails closed for an unknown IP when full", async () => {
    let now = 0;
    const store = new InMemoryThrottleStore({ maxEntries: 2, clock: () => now });
    const lock = { attempts: [0, 1, 2, 3, 4], lockoutUntil: 15 * MINUTE, lockoutLevel: 1, lastLockoutAt: 0 };
    await store.set("ip:locked-a", lock);
    await store.set("ip:locked-b", lock);
    const throttle = createLoginThrottle(store, () => now);

    expect(await throttle.check("locked-a")).toEqual({ retryAfterSeconds: 900 });
    expect(await throttle.check("new")).toEqual({ retryAfterSeconds: 60 });
    expect(await throttle.recordFailure("new")).toEqual({ retryAfterSeconds: 60 });
    expect(await store.get("ip:new")).toBeUndefined();
    expect(await store.get("ip:locked-a")).toBeDefined();
    expect(await store.get("ip:locked-b")).toBeDefined();
    now += 15 * MINUTE;
    expect(await throttle.check("new")).toBeNull();
  });
});
