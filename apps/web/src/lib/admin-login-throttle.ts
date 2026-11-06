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

export interface ThrottleDecision {
  retryAfterSeconds: number;
}

export interface LoginThrottle {
  check(ip: string): Promise<ThrottleDecision | null>;
  recordFailure(ip: string): Promise<ThrottleDecision | null>;
  clear(ip: string): Promise<void>;
}

const MAX_STORE_ENTRIES = 10_000;
const IP_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPT_LIMIT = 5;
const INITIAL_LOCKOUT_MS = 15 * 60 * 1000;
const MAX_LOCKOUT_MS = 60 * 60 * 1000;
const LOCKOUT_RESET_MS = 24 * 60 * 60 * 1000;
const STORE_FULL_RETRY_MS = 60 * 1000;
const IP_PREFIX = "ip:";

export class ThrottleStoreFullError extends Error {
  constructor() {
    super("Throttle store has no eligible IP state to evict");
    this.name = "ThrottleStoreFullError";
  }
}

interface StoreOptions {
  maxEntries?: number;
  clock?: () => number;
}

interface Runtime {
  store: ThrottleStore;
  clock: () => number;
}

// Workers isolates are ephemeral. This per-IP memory limit is deliberate for a single-owner site.
// A future Cloudflare KV ThrottleStore can share state when the site needs distributed enforcement.
export class InMemoryThrottleStore implements ThrottleStore {
  private readonly values = new Map<string, ThrottleState>();
  private readonly maxEntries: number;
  private readonly clock: () => number;

  constructor(options: StoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? MAX_STORE_ENTRIES;
    this.clock = options.clock ?? Date.now;
    if (this.maxEntries < 1) throw new Error("Throttle store must allow per-IP state");
  }

  async get(key: string): Promise<ThrottleState | undefined> {
    const value = this.values.get(key);
    if (!value) return undefined;
    this.values.delete(key);
    this.values.set(key, value);
    return { ...value, attempts: [...value.attempts] };
  }

  async set(key: string, value: ThrottleState): Promise<void> {
    this.evictForNewIp(key);
    this.values.delete(key);
    this.values.set(key, { ...value, attempts: [...value.attempts] });
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  canStore(key: string): boolean {
    if (this.values.has(key)) return true;
    if (this.values.size < this.maxEntries) return true;
    return this.findEvictableIp() !== undefined;
  }

  private evictForNewIp(key: string): void {
    if (this.values.has(key)) return;
    if (this.values.size < this.maxEntries) return;
    const evictable = this.findEvictableIp();
    if (!evictable) throw new ThrottleStoreFullError();
    this.values.delete(evictable);
  }

  private findEvictableIp(): string | undefined {
    const now = this.clock();
    for (const [key, state] of this.values) {
      if (isExpiredState(state, now)) return key;
    }
    let candidate: { key: string; lastFailure: number } | undefined;
    for (const [key, state] of this.values) {
      if (state.lockoutUntil > now) continue;
      const lastFailure = state.attempts.at(-1) ?? state.lastLockoutAt;
      if (!candidate) {
        candidate = { key, lastFailure };
        continue;
      }
      if (lastFailure < candidate.lastFailure) candidate = { key, lastFailure };
    }
    return candidate?.key;
  }
}

export function createLoginThrottle(store: ThrottleStore = new InMemoryThrottleStore(), clock: () => number = Date.now): LoginThrottle {
  const runtime = { store, clock };
  return {
    check(ip) { return checkIp(runtime, ip); },
    recordFailure(ip) { return recordIpFailure(runtime, ip); },
    clear(ip) { return store.delete(ipKey(ip)); },
  };
}

async function checkIp(runtime: Runtime, ip: string): Promise<ThrottleDecision | null> {
  const { store, clock } = runtime;
  const key = ipKey(ip);
  const existing = await store.get(key);
  const now = clock();
  if (!existing) return checkUnknownIpCapacity(store, key);
  if (existing.lockoutUntil <= now) return null;
  return lockoutDecision(existing.lockoutUntil, now);
}

function checkUnknownIpCapacity(store: ThrottleStore, key: string): ThrottleDecision | null {
  if (!storeCanNotStoreUnknownIp(store, key)) return null;
  return { retryAfterSeconds: STORE_FULL_RETRY_MS / 1000 };
}

function storeCanNotStoreUnknownIp(store: ThrottleStore, key: string): boolean {
  if (!(store instanceof InMemoryThrottleStore)) return false;
  return !store.canStore(key);
}

async function recordIpFailure(runtime: Runtime, ip: string): Promise<ThrottleDecision | null> {
  const { store, clock } = runtime;
  const key = ipKey(ip);
  const now = clock();
  const current = await store.get(key) ?? emptyState();
  if (current.lockoutUntil > now) return lockoutDecision(current.lockoutUntil, now);
  const attempts = current.attempts.filter((timestamp) => now - timestamp < IP_WINDOW_MS);
  attempts.push(now);
  const next = nextFailureState(current, attempts, now);
  try {
    await store.set(key, next);
  } catch (error) {
    if (!(error instanceof ThrottleStoreFullError)) throw error;
    return { retryAfterSeconds: STORE_FULL_RETRY_MS / 1000 };
  }
  if (next.lockoutUntil > now) return lockoutDecision(next.lockoutUntil, now);
  return null;
}

function nextFailureState(current: ThrottleState, attempts: number[], now: number): ThrottleState {
  const lockoutWasReset = isLockoutReset(current, now);
  const lockoutLevel = lockoutWasReset ? 0 : current.lockoutLevel;
  if (attempts.length < ATTEMPT_LIMIT) {
    return { ...current, attempts, lockoutLevel, lastLockoutAt: lockoutWasReset ? -1 : current.lastLockoutAt };
  }
  const nextLevel = lockoutLevel + 1;
  const duration = Math.min(INITIAL_LOCKOUT_MS * 2 ** (nextLevel - 1), MAX_LOCKOUT_MS);
  return { attempts, lockoutUntil: now + duration, lockoutLevel: nextLevel, lastLockoutAt: now };
}

function isLockoutReset(state: ThrottleState, now: number): boolean {
  if (state.lastLockoutAt < 0) return false;
  return now - state.lastLockoutAt >= LOCKOUT_RESET_MS;
}

function emptyState(): ThrottleState {
  return { attempts: [], lockoutUntil: 0, lockoutLevel: 0, lastLockoutAt: -1 };
}

function lockoutDecision(until: number, now: number): ThrottleDecision {
  return { retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)) };
}

function ipKey(ip: string): string {
  return `${IP_PREFIX}${ip}`;
}

function isExpiredState(state: ThrottleState, now: number): boolean {
  if (state.lockoutUntil > now) return false;
  if (state.attempts.some((timestamp) => now - timestamp < IP_WINDOW_MS)) return false;
  if (state.lastLockoutAt < 0) return true;
  return now - state.lastLockoutAt >= LOCKOUT_RESET_MS;
}
