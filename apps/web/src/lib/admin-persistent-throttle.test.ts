import { describe, expect, it } from "vitest";
import { createLoginThrottle } from "./admin-login-throttle";
import { PersistentAdminThrottleStore } from "./admin-login";

function makeAdapter() {
  const values = new Map<string, string>();
  return {
    read: async (key: string) => values.get(key) ?? null,
    write: async (key: string, value: string) => { values.set(key, value); },
  };
}

describe("persistent admin login throttle", () => {
  it("shares and serializes attempts across independently created throttle instances", async () => {
    const store = makeAdapter();
    let tail: Promise<void> = Promise.resolve();
    const lock = async <T>(action: () => Promise<T>): Promise<T> => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try { return await action(); }
      finally { release(); }
    };
    const first = createLoginThrottle({ store: new PersistentAdminThrottleStore(store, lock) });
    const second = createLoginThrottle({ store: new PersistentAdminThrottleStore(store, lock) });

    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => (index % 2 ? first : second).recordFailure({ ip: "203.0.113.1" })));
    expect(results.filter(result => result === null)).toHaveLength(4);
    expect(results.filter(result => result?.retryAfterSeconds === 900)).toHaveLength(6);
    expect((await first.check({ ip: "203.0.113.1" }))?.retryAfterSeconds).toBe(900);
  });
});
