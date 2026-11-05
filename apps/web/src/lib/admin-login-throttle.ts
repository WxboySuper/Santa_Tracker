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

const GLOBAL_KEY = "global";
const MAX_STORE_ENTRIES = 10_001;
const MAX_PENDING_FAILURES = 10_000;

export class InMemoryThrottleStore implements ThrottleStore {
  private readonly values = new Map<string, ThrottleState>();

  constructor(private readonly maxEntries = MAX_STORE_ENTRIES) {
    if (maxEntries < 2) throw new Error("Throttle store must allow global and per-IP state");
  }

  async get(key: string): Promise<ThrottleState | undefined> {
    const value = this.values.get(key);
    if (value) {
      this.values.delete(key);
      this.values.set(key, value);
    }
    return value ? { ...value, attempts: [...value.attempts] } : undefined;
  }

  async set(key: string, value: ThrottleState): Promise<void> {
    this.values.delete(key);
    this.values.set(key, { ...value, attempts: [...value.attempts] });
    this.evictOldestIpEntries();
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  private evictOldestIpEntries(): void {
    while (this.values.size > this.maxEntries) {
      const oldestIpKey = [...this.values.keys()].find((key) => key !== GLOBAL_KEY);
      if (!oldestIpKey) return;
      this.values.delete(oldestIpKey);
    }
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
  let failureQueue: Promise<void> = Promise.resolve();
  let pendingFailures = 0;
  return {
    check(ip, authenticated = false) {
      return checkThrottle(store, clock, ip, authenticated);
    },
    recordFailure(ip, authenticated = false) {
      if (pendingFailures >= MAX_PENDING_FAILURES) {
        return Promise.resolve({ retryAfterSeconds: 1, reason: "global" });
      }
      pendingFailures += 1;
      const task = () => recordFailedAttempt(store, clock, ip, authenticated);
      const current = failureQueue.then(task, task);
      failureQueue = current.then(() => undefined, () => undefined);
      return current.finally(() => {
        pendingFailures -= 1;
      });
    },
    async clear(ip) {
      await store.delete(ipKey(ip));
    },
  };
}

async function recordFailedAttempt(store: ThrottleStore, clock: () => number, ip: string, authenticated: boolean): Promise<ThrottleDecision | null> {
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
