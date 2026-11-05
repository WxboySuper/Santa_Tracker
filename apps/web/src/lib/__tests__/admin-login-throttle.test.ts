import { describe, expect, it } from "vitest";
import { createLoginThrottle, InMemoryThrottleStore } from "../admin-login-throttle";

const MINUTE = 60_000;

function setup() {
  let now = 0;
  const throttle = createLoginThrottle(new InMemoryThrottleStore(), () => now);
  return { throttle, advance: (milliseconds: number) => { now += milliseconds; } };
}

describe("admin login throttle", () => {
  it("slides the per-IP window as earlier failures expire", () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 4; i += 1) throttle.recordFailure("ip-a");
    advance(15 * MINUTE + 1);
    throttle.recordFailure("ip-a");
    expect(throttle.check("ip-a")).toBeNull();
  });

  it("locks the fifth failure for 15 minutes and doubles repeated lockouts up to one hour", () => {
    const { throttle, advance } = setup();
    let decision: ReturnType<typeof throttle.recordFailure> = null;
    for (let i = 0; i < 5; i += 1) decision = throttle.recordFailure("ip-a");
    expect(decision).toEqual({ retryAfterSeconds: 900, reason: "ip" });
    expect(throttle.check("ip-a")).toEqual({ retryAfterSeconds: 900, reason: "ip" });
    advance(15 * MINUTE);
    for (let i = 0; i < 5; i += 1) decision = throttle.recordFailure("ip-a");
    expect(decision).toEqual({ retryAfterSeconds: 1800, reason: "ip" });
    advance(30 * MINUTE);
    for (let i = 0; i < 5; i += 1) decision = throttle.recordFailure("ip-a");
    expect(decision).toEqual({ retryAfterSeconds: 3600, reason: "ip" });
    advance(60 * MINUTE);
    for (let i = 0; i < 5; i += 1) decision = throttle.recordFailure("ip-a");
    expect(decision).toEqual({ retryAfterSeconds: 3600, reason: "ip" });
  });

  it("caps distributed failures after more than 30 in one hour", () => {
    const { throttle } = setup();
    let decision: ReturnType<typeof throttle.recordFailure> = null;
    for (let i = 0; i < 31; i += 1) decision = throttle.recordFailure(`ip-${i}`);
    expect(decision?.reason).toBe("global");
    expect(throttle.check("new-ip")?.reason).toBe("global");
    expect(throttle.check("new-ip", true)).toBeNull();
  });

  it("clears an IP's counter on successful login and expires global failures after an hour", () => {
    const { throttle, advance } = setup();
    for (let i = 0; i < 4; i += 1) throttle.recordFailure("ip-a");
    throttle.clear("ip-a");
    expect(throttle.check("ip-a")).toBeNull();
    for (let i = 0; i < 31; i += 1) throttle.recordFailure(`global-${i}`);
    advance(60 * MINUTE + 1);
    expect(throttle.check("new-ip")).toBeNull();
  });
});
