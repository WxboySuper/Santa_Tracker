export interface ThrottleState {
  attempts: number[];
  lockoutUntil: number;
  lockoutLevel: number;
  lastLockoutAt: number;
}

export interface ThrottleStore {
  get(input: { key: string }): Promise<ThrottleState | undefined>;
  set(input: { key: string; value: ThrottleState }): Promise<void>;
  delete(input: { key: string }): Promise<void>;
  update(input: { key: string; transform: (current: ThrottleState | undefined) => ThrottleState }): ThrottleState | Promise<ThrottleState>;
}

export interface ThrottleDecision {
  retryAfterSeconds: number;
}

export interface LoginThrottle {
  check(input: { ip: string }): Promise<ThrottleDecision | null>;
  checkNow(input: { ip: string }): ThrottleDecision | null;
  recordFailure(input: { ip: string }): Promise<ThrottleDecision | null>;
  clear(input: { ip: string }): Promise<void>;
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
// A shared adapter must make update atomic; a plain KV get/set pair is not enough for distributed enforcement.
export class InMemoryThrottleStore implements ThrottleStore {
  private readonly values = new Map<string, ThrottleState>();
  private readonly maxEntries: number;
  private readonly clock: () => number;

  constructor(options: StoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? MAX_STORE_ENTRIES;
    this.clock = options.clock ?? Date.now;
    if (this.maxEntries < 1) throw new Error("Throttle store must allow per-IP state");
  }

  async get({ key }: { key: string }): Promise<ThrottleState | undefined> {
    const value = this.values.get(key);
    if (!value) return undefined;
    this.values.delete(key);
    this.values.set(key, value);
    return { ...value, attempts: [...value.attempts] };
  }

  peek({ key }: { key: string }): ThrottleState | undefined {
    return this.clone(this.values.get(key));
  }

  async set({ key, value }: { key: string; value: ThrottleState }): Promise<void> {
    this.write({ key, value });
  }

  async delete({ key }: { key: string }): Promise<void> {
    this.values.delete(key);
  }

  canStore({ key }: { key: string }): boolean {
    if (this.values.has(key)) return true;
    if (this.values.size < this.maxEntries) return true;
    return this.findEvictableIp() !== undefined;
  }

  update(input: { key: string; transform: (current: ThrottleState | undefined) => ThrottleState }): ThrottleState {
    const { key, transform } = input;
    const current = this.clone(this.values.get(key));
    const updated = transform(current);
    this.write({ key, value: updated });
    return this.clone(updated)!;
  }

  private write(input: { key: string; value: ThrottleState }): void {
    const { key, value } = input;
    this.evictForNewIp({ key });
    this.values.delete(key);
    this.values.set(key, this.clone(value)!);
  }

  private evictForNewIp({ key }: { key: string }): void {
    if (this.values.has(key)) return;
    if (this.values.size < this.maxEntries) return;
    const evictable = this.findEvictableIp();
    if (!evictable) throw new ThrottleStoreFullError();
    this.values.delete(evictable);
  }

  private clone(value: ThrottleState | undefined): ThrottleState | undefined {
    if (!value) return undefined;
    return { ...value, attempts: [...value.attempts] };
  }

  private findEvictableIp(): string | undefined {
    const now = this.clock();
    const entries = [...this.values.entries()];
    const expired = entries.find(([, state]) => isExpiredState({ state, now }));
    if (expired) return expired[0];
    return entries
      .filter(([, state]) => state.lockoutUntil <= now)
      .sort((left, right) => lastFailureAt(left[1]) - lastFailureAt(right[1]))[0]?.[0];
  }
}

export function createLoginThrottle(input: { store?: ThrottleStore; clock?: () => number } = {}): LoginThrottle {
  const store = input.store ?? new InMemoryThrottleStore();
  const clock = input.clock ?? Date.now;
  const runtime = { store, clock };
  return {
    check({ ip }) { return checkIp({ runtime, ip }); },
    checkNow({ ip }) { return checkInMemoryIp({ runtime, ip }); },
    recordFailure({ ip }) { return recordIpFailure({ runtime, ip }); },
    clear({ ip }) { return store.delete({ key: ipKey({ ip }) }); },
  };
}

function checkInMemoryIp(input: { runtime: Runtime; ip: string }): ThrottleDecision | null {
  const { runtime, ip } = input;
  const { store, clock } = runtime;
  if (!(store instanceof InMemoryThrottleStore)) throw new Error("Synchronous throttle checks require in-memory storage");
  const key = ipKey({ ip });
  const existing = store.peek({ key });
  const now = clock();
  if (!existing) return checkUnknownIpCapacity({ store, key });
  if (existing.lockoutUntil <= now) return null;
  return lockoutDecision({ until: existing.lockoutUntil, now });
}

async function checkIp(input: { runtime: Runtime; ip: string }): Promise<ThrottleDecision | null> {
  const { runtime, ip } = input;
  const { store, clock } = runtime;
  const key = ipKey({ ip });
  const existing = await store.get({ key });
  const now = clock();
  if (!existing) return checkUnknownIpCapacity({ store, key });
  if (existing.lockoutUntil <= now) return null;
  return lockoutDecision({ until: existing.lockoutUntil, now });
}

function checkUnknownIpCapacity(input: { store: ThrottleStore; key: string }): ThrottleDecision | null {
  if (!storeCanNotStoreUnknownIp(input)) return null;
  return { retryAfterSeconds: STORE_FULL_RETRY_MS / 1000 };
}

function storeCanNotStoreUnknownIp(input: { store: ThrottleStore; key: string }): boolean {
  const { store, key } = input;
  if (!(store instanceof InMemoryThrottleStore)) return false;
  return !store.canStore({ key });
}

async function recordIpFailure(input: { runtime: Runtime; ip: string }): Promise<ThrottleDecision | null> {
  const { runtime, ip } = input;
  const { store, clock } = runtime;
  const key = ipKey({ ip });
  const now = clock();
  return recordFailureWithStore({ store, key, now });
}

async function recordFailureWithStore(input: { store: ThrottleStore; key: string; now: number }): Promise<ThrottleDecision | null> {
  const { store, key, now } = input;
  try {
    const next = await store.update({ key, transform: (current) => advanceFailure({ current: current ?? emptyState(), now }) });
    if (next.lockoutUntil > now) return lockoutDecision({ until: next.lockoutUntil, now });
    return null;
  } catch (error) {
    if (!(error instanceof ThrottleStoreFullError)) throw error;
    return { retryAfterSeconds: STORE_FULL_RETRY_MS / 1000 };
  }
}

function advanceFailure(input: { current: ThrottleState; now: number }): ThrottleState {
  const { current, now } = input;
  if (current.lockoutUntil > now) return current;
  const attempts = current.attempts.filter((timestamp) => now - timestamp < IP_WINDOW_MS);
  attempts.push(now);
  return nextFailureState({ current, attempts, now });
}

function nextFailureState(input: { current: ThrottleState; attempts: number[]; now: number }): ThrottleState {
  const { current, attempts, now } = input;
  const lockoutWasReset = isLockoutReset({ state: current, now });
  const lockoutLevel = lockoutWasReset ? 0 : current.lockoutLevel;
  if (attempts.length < ATTEMPT_LIMIT) {
    return { ...current, attempts, lockoutLevel, lastLockoutAt: lockoutWasReset ? -1 : current.lastLockoutAt };
  }
  const nextLevel = lockoutLevel + 1;
  const duration = Math.min(INITIAL_LOCKOUT_MS * 2 ** (nextLevel - 1), MAX_LOCKOUT_MS);
  return { attempts, lockoutUntil: now + duration, lockoutLevel: nextLevel, lastLockoutAt: now };
}

function isLockoutReset(input: { state: ThrottleState; now: number }): boolean {
  const { state, now } = input;
  if (state.lastLockoutAt < 0) return false;
  return now - state.lastLockoutAt >= LOCKOUT_RESET_MS;
}

function emptyState(): ThrottleState {
  return { attempts: [], lockoutUntil: 0, lockoutLevel: 0, lastLockoutAt: -1 };
}

function lockoutDecision(input: { until: number; now: number }): ThrottleDecision {
  const { until, now } = input;
  return { retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)) };
}

function ipKey({ ip }: { ip: string }): string {
  return `${IP_PREFIX}${ip}`;
}

function isExpiredState(input: { state: ThrottleState; now: number }): boolean {
  const { state, now } = input;
  if (state.lockoutUntil > now) return false;
  if (state.attempts.some((timestamp) => now - timestamp < IP_WINDOW_MS)) return false;
  if (state.lastLockoutAt < 0) return true;
  return now - state.lastLockoutAt >= LOCKOUT_RESET_MS;
}

function lastFailureAt(state: ThrottleState): number {
  return state.attempts.at(-1) ?? state.lastLockoutAt;
}
