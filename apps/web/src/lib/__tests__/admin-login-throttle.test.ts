import { describe, expect, it } from "vitest";
import { createLoginThrottle, InMemoryThrottleStore } from "../admin-login-throttle";

const MINUTE = 60_000;

function setup() {
  let now = 0;
  const store = new InMemoryThrottleStore({ maxEntries: 10_001, clock: () => now });
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

  it("does not let a concurrent check erase a global failure", async () => {
    const now = 60 * MINUTE + 1;
    const memory = new InMemoryThrottleStore({ maxEntries: 10, clock: () => now });
    const attempts = Array.from({ length: 30 }, () => now - 1000);
    attempts.push(now - 60 * MINUTE - 1);
    await memory.set("global", { attempts, lockoutUntil: 0, lockoutLevel: 0, lastLockoutAt: -1 });

    let releaseRead: () => void = () => undefined;
    let signalRead: () => void = () => undefined;
    let paused = false;
    const readStarted = new Promise<void>((resolve) => { signalRead = resolve; });
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
    const store = {
      async get(key: string) {
        const value = await memory.get(key);
        if (key === "global" && !paused) {
          paused = true;
          signalRead();
          await readGate;
        }
        return value;
      },
      set: (key: string, value: Parameters<typeof memory.set>[1]) => memory.set(key, value),
      delete: (key: string) => memory.delete(key),
    };
    const throttle = createLoginThrottle(store, () => now);
    const concurrentCheck = throttle.check("probe");
    await readStarted;
    const concurrentFailure = throttle.recordFailure("racer");
    releaseRead();
    await Promise.all([concurrentCheck, concurrentFailure]);

    expect((await throttle.check("next-ip"))?.reason).toBe("global");
  });

  it("does not add more global failures from an already locked IP", async () => {
    const { throttle } = setup();
    for (let i = 0; i < 5; i += 1) await throttle.recordFailure("locked-ip");
    for (let i = 0; i < 25; i += 1) await throttle.recordFailure(`other-${i}`);
    for (let i = 0; i < 5; i += 1) await throttle.recordFailure("locked-ip");
    expect(await throttle.check("new-ip")).toBeNull();
    expect((await throttle.recordFailure("last-ip"))?.reason).toBe("global");
  });

  it("does not allocate storage for unknown IPs during a read-only check", async () => {
    const { throttle, store } = setup();
    expect(await throttle.check("unknown-client")).toBeNull();
    expect(await store.get("ip:unknown-client")).toBeUndefined();
  });

  it("fails closed instead of evicting recent unlocked failure state", async () => {
    const now = 1000;
    const store = new InMemoryThrottleStore({ maxEntries: 2, clock: () => now });
    await store.set("global", { attempts: [], lockoutUntil: 0, lockoutLevel: 0, lastLockoutAt: -1 });
    await store.set("ip:partial", { attempts: [now], lockoutUntil: 0, lockoutLevel: 0, lastLockoutAt: -1 });
    const throttle = createLoginThrottle(store, () => now);

    expect(await throttle.check("new")).toEqual({ retryAfterSeconds: 60, reason: "global" });
    expect(await store.get("ip:partial")).toBeDefined();
  });

  it("returns 429 when recording the global counter cannot fit in the store", async () => {
    const now = 1000;
    const store = new InMemoryThrottleStore({ maxEntries: 2, clock: () => now });
    const state = { attempts: [now], lockoutUntil: 0, lockoutLevel: 0, lastLockoutAt: -1 };
    await store.set("ip:recent-a", state);
    await store.set("ip:recent-b", state);
    const throttle = createLoginThrottle(store, () => now);

    await expect(throttle.recordFailure("new")).resolves.toEqual({ retryAfterSeconds: 60, reason: "global" });
    expect(await store.get("global")).toBeUndefined();
  });

  it("keeps the global cap bypass for authenticated failed logins", async () => {
    const { throttle } = setup();
    for (let i = 0; i < 31; i += 1) await throttle.recordFailure(`ip-${i}`);
    expect(await throttle.recordFailure("authenticated-ip", true)).toBeNull();
    expect((await throttle.check("new-ip"))?.reason).toBe("global");
  });

  it("does not let authenticated failures fill the anonymous global bucket", async () => {
    const { throttle, store } = setup();
    for (let i = 0; i < 31; i += 1) await throttle.recordFailure(`trusted-${i}`, true);

    expect((await throttle.check("anonymous"))?.reason).toBeUndefined();
    expect(await store.get("global")).toBeUndefined();
  });

  it("keeps only the newest 31 timestamps needed to calculate global expiry", async () => {
    const { throttle, store } = setup();
    for (let i = 0; i < 50; i += 1) await throttle.recordFailure(`burst-${i}`);

    expect((await store.get("global"))?.attempts).toHaveLength(31);
    expect((await throttle.check("anonymous"))?.retryAfterSeconds).toBe(3600);
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

  it("serializes a successful clear after an in-flight state update", async () => {
    const now = 20 * MINUTE;
    const memory = new InMemoryThrottleStore({ maxEntries: 4, clock: () => now });
    await memory.set("ip:old", { attempts: [0], lockoutUntil: 0, lockoutLevel: 0, lastLockoutAt: -1 });
    let releaseWrite: () => void = () => undefined;
    let signalWrite: () => void = () => undefined;
    const writeStarted = new Promise<void>((resolve) => { signalWrite = resolve; });
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const store = {
      get: (key: string) => memory.get(key),
      async set(key: string, value: Parameters<typeof memory.set>[1]) {
        if (key === "ip:old") {
          signalWrite();
          await writeGate;
        }
        await memory.set(key, value);
      },
      delete: (key: string) => memory.delete(key),
    };
    const throttle = createLoginThrottle(store, () => now);
    const pendingCheck = throttle.check("old");
    await writeStarted;
    const pendingClear = throttle.clear("old");
    releaseWrite();
    await Promise.all([pendingCheck, pendingClear]);

    expect(await memory.get("ip:old")).toBeUndefined();
  });

  it("bounds in-memory keys while preserving the global counter and recently used IPs", async () => {
    const store = new InMemoryThrottleStore({ maxEntries: 3 });
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

  it("preserves active lockouts and fails closed when no state can be evicted", async () => {
    let now = 0;
    const store = new InMemoryThrottleStore({ maxEntries: 2, clock: () => now });
    await store.set("global", { attempts: [], lockoutUntil: 0, lockoutLevel: 0, lastLockoutAt: -1 });
    await store.set("ip:locked", { attempts: [0, 1, 2, 3, 4], lockoutUntil: 15 * MINUTE, lockoutLevel: 1, lastLockoutAt: 0 });
    const throttle = createLoginThrottle(store, () => now);
    expect(await throttle.check("locked")).toEqual({ retryAfterSeconds: 900, reason: "ip" });
    expect(await throttle.check("new")).toEqual({ retryAfterSeconds: 60, reason: "global" });
    expect(await store.get("ip:new")).toBeUndefined();
    expect(await store.get("ip:locked")).toBeDefined();
    now += 15 * MINUTE;
    expect(await throttle.check("locked")).toBeNull();
    expect(await throttle.check("new")).toEqual({ retryAfterSeconds: 60, reason: "global" });
    now += 24 * 60 * MINUTE;
    expect(await throttle.check("new")).toBeNull();
    expect(await throttle.recordFailure("new")).toBeNull();
    expect(await store.get("ip:locked")).toBeUndefined();
  });
});
