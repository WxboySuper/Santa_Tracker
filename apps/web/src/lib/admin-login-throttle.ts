export interface ThrottleState {
  attempts: number[];
  lockoutUntil: number;
  lockoutLevel: number;
  lastLockoutAt: number;
}

export interface ThrottleStore {
  get(key: string): Promise<ThrottleState | undefined>;
  set(key: string, value: ThrottleState): Promise<void>;
  delete(key: string): Promise<void>;
}

export class InMemoryThrottleStore implements ThrottleStore {
  private readonly values = new Map<string, ThrottleState>();

  async get(key: string): Promise<ThrottleState | undefined> {
    const value = this.values.get(key);
    return value ? { ...value, attempts: [...value.attempts] } : undefined;
  }

  async set(key: string, value: ThrottleState): Promise<void> {
    this.values.set(key, { ...value, attempts: [...value.attempts] });
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const IP_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const ATTEMPT_LIMIT = 5;
const GLOBAL_ATTEMPT_LIMIT = 30;
const INITIAL_LOCKOUT_MS = 15 * 60 * 1000;
const MAX_LOCKOUT_MS = 60 * 60 * 1000;
const LOCKOUT_RESET_MS = 24 * 60 * 60 * 1000;
const IP_PREFIX = "ip:";
const GLOBAL_KEY = "global";

export interface ThrottleDecision {
  retryAfterSeconds: number;
  reason: "ip" | "global";
}

export interface LoginThrottle {
  check(ip: string, authenticated?: boolean): Promise<ThrottleDecision | null>;
  recordFailure(ip: string, authenticated?: boolean): Promise<ThrottleDecision | null>;
  clear(ip: string): Promise<void>;
}

// Workers isolates are ephemeral, so this memory store only offers best-effort throttling.
// A Cloudflare KV binding could implement ThrottleStore later for shared state.
export function createLoginThrottle(store: ThrottleStore = new InMemoryThrottleStore(), clock: () => number = Date.now): LoginThrottle {
  return {
    check(ip, authenticated = false) {
      return checkThrottle(store, clock, ip, authenticated);
    },
    async recordFailure(ip, authenticated = false) {
      const now = clock();
      const key = ipKey(ip);
      const state = await readState(store, key, now, IP_WINDOW_MS);
      if (state.lockoutUntil > now) return checkThrottle(store, clock, ip, authenticated);
      await recordGlobalFailure(store, now);

      const lockoutIsStale = state.lastLockoutAt >= 0 && now - state.lastLockoutAt >= LOCKOUT_RESET_MS;
      const previousLockoutAt = lockoutIsStale ? -1 : state.lastLockoutAt;
      const previousLevel = previousLockoutAt < 0 ? 0 : state.lockoutLevel;
      const attempts = [...state.attempts, now];
      let lockoutUntil = state.lockoutUntil;
      let lockoutLevel = previousLevel;
      let lastLockoutAt = previousLockoutAt;
      if (attempts.length >= ATTEMPT_LIMIT) {
        lockoutLevel += 1;
        const duration = Math.min(INITIAL_LOCKOUT_MS * 2 ** (lockoutLevel - 1), MAX_LOCKOUT_MS);
        lockoutUntil = now + duration;
        lastLockoutAt = now;
      }
      await store.set(key, { attempts, lockoutUntil, lockoutLevel, lastLockoutAt });
      return checkThrottle(store, clock, ip, authenticated);
    },
    async clear(ip) {
      await store.delete(ipKey(ip));
    },
  };
}

async function checkThrottle(store: ThrottleStore, clock: () => number, ip: string, authenticated = false): Promise<ThrottleDecision | null> {
  const now = clock();
  const ipState = await readState(store, ipKey(ip), now, IP_WINDOW_MS);
  if (ipState.lockoutUntil > now) return decision(ipState.lockoutUntil, now, "ip");
  if (authenticated) return null;
  const globalState = await readState(store, GLOBAL_KEY, now, GLOBAL_WINDOW_MS);
  if (globalState.attempts.length > GLOBAL_ATTEMPT_LIMIT) {
    return decision(globalState.attempts[0]! + GLOBAL_WINDOW_MS, now, "global");
  }
  return null;
}

async function recordGlobalFailure(store: ThrottleStore, now: number): Promise<void> {
  const globalState = await readState(store, GLOBAL_KEY, now, GLOBAL_WINDOW_MS);
  globalState.attempts.push(now);
  await store.set(GLOBAL_KEY, globalState);
}

async function readState(store: ThrottleStore, key: string, now: number, windowMs: number): Promise<ThrottleState> {
  const state = await store.get(key) ?? { attempts: [], lockoutUntil: 0, lockoutLevel: 0, lastLockoutAt: -1 };
  const attempts = state.attempts.filter((timestamp) => now - timestamp < windowMs);
  const next = { ...state, attempts };
  if (attempts.length !== state.attempts.length) await store.set(key, next);
  return next;
}

function ipKey(ip: string): string {
  return `${IP_PREFIX}${ip}`;
}

function decision(until: number, now: number, reason: ThrottleDecision["reason"]): ThrottleDecision {
  return { retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)), reason };
}
