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
const IP_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const ATTEMPT_LIMIT = 5;
const GLOBAL_ATTEMPT_LIMIT = 30;
const INITIAL_LOCKOUT_MS = 15 * 60 * 1000;
const MAX_LOCKOUT_MS = 60 * 60 * 1000;
const LOCKOUT_RESET_MS = 24 * 60 * 60 * 1000;
const STORE_FULL_RETRY_MS = 60 * 1000;
const IP_PREFIX = "ip:";

export class ThrottleStoreFullError extends Error {
  constructor() {
    super("Throttle store is full of active state");
    this.name = "ThrottleStoreFullError";
  }
}

export class InMemoryThrottleStore implements ThrottleStore {
  private readonly values = new Map<string, ThrottleState>();
  private readonly maxEntries: number;
  private readonly clock: () => number;

  constructor(options: ThrottleStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? MAX_STORE_ENTRIES;
    this.clock = options.clock ?? Date.now;
    if (this.maxEntries < 2) throw new Error("Throttle store must allow global and per-IP state");
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
    const isUpdate = this.values.has(key);
    if (isUpdate) this.values.delete(key);
    if (this.values.size >= this.maxEntries) {
      const evictable = this.findExpiredIpEntry();
      if (!evictable) throw new ThrottleStoreFullError();
      this.values.delete(evictable);
    }
    this.values.set(key, { ...value, attempts: [...value.attempts] });
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  private findExpiredIpEntry(): string | undefined {
    const now = this.clock();
    let oldestKey: string | undefined;
    let oldestFailureAt = Number.POSITIVE_INFINITY;
    for (const [key, state] of this.values) {
      if (isExpiredIpState({ key, state, now })) return key;
      if (key === GLOBAL_KEY) continue;
      if (state.lockoutUntil > now) continue;
      const lastFailureAt = state.attempts.at(-1) ?? Number.NEGATIVE_INFINITY;
      if (lastFailureAt < oldestFailureAt) {
        oldestKey = key;
        oldestFailureAt = lastFailureAt;
      }
    }
    return oldestKey;
  }
}

export interface ThrottleDecision {
  retryAfterSeconds: number;
  reason: "ip" | "global";
}

export interface LoginThrottle {
  check(ip: string, authenticated?: boolean): Promise<ThrottleDecision | null>;
  recordFailure(ip: string, authenticated?: boolean): Promise<ThrottleDecision | null>;
  clear(ip: string): Promise<void>;
}

interface ThrottleRuntime {
  store: ThrottleStore;
  clock: () => number;
}

interface LoginAttempt {
  ip: string;
  authenticated: boolean;
}

interface StateQuery {
  store: ThrottleStore;
  key: string;
  now: number;
  windowMs: number;
}

interface DecisionInput {
  until: number;
  now: number;
  reason: ThrottleDecision["reason"];
}

interface ThrottleStoreOptions {
  maxEntries?: number;
  clock?: () => number;
}

interface ExpiryQuery {
  key: string;
  state: ThrottleState;
  now: number;
}

interface TimedRuntime extends ThrottleRuntime {
  now: number;
}

// Workers isolates are ephemeral, so this memory store only offers best-effort throttling.
// A Cloudflare KV binding could implement ThrottleStore later for shared state.
export function createLoginThrottle(store: ThrottleStore = new InMemoryThrottleStore(), clock: () => number = Date.now): LoginThrottle {
  const runtime = { store, clock };
  let failureQueue: Promise<void> = Promise.resolve();
  let pendingOperations = 0;
  const enqueue = <T>(task: () => Promise<T>, overflow: () => T): Promise<T> => {
    if (pendingOperations >= MAX_PENDING_FAILURES) return Promise.resolve(overflow());
    pendingOperations += 1;
    const current = failureQueue.then(task, task);
    failureQueue = current.then(() => undefined, () => undefined);
    return current.finally(() => {
      pendingOperations -= 1;
    });
  };
  return {
    check(ip, authenticated = false) {
      return enqueue(() => checkThrottle(runtime, { ip, authenticated }), () => ({ retryAfterSeconds: 1, reason: "global" }));
    },
    recordFailure(ip, authenticated = false) {
      return enqueue(
        () => recordFailedAttempt(runtime, { ip, authenticated }),
        () => ({ retryAfterSeconds: 1, reason: "global" }),
      );
    },
    async clear(ip) {
      await runtime.store.delete(`${IP_PREFIX}${ip}`);
    },
  };
}

async function recordFailedAttempt(runtime: ThrottleRuntime, attempt: LoginAttempt): Promise<ThrottleDecision | null> {
  const { store, clock } = runtime;
  const now = clock();
  const key = `${IP_PREFIX}${attempt.ip}`;
  const state = await readState({ store, key, now, windowMs: IP_WINDOW_MS });
  if (state.lockoutUntil > now) return checkThrottle(runtime, attempt);
  await recordGlobalFailure({ ...runtime, now });

  const lockoutIsStale = isStaleLockout(state, now);
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
  try {
    await store.set(key, { attempts, lockoutUntil, lockoutLevel, lastLockoutAt });
  } catch (error) {
    if (error instanceof ThrottleStoreFullError) {
      return decision({ until: now + STORE_FULL_RETRY_MS, now, reason: "global" });
    }
    throw error;
  }
  return checkThrottle(runtime, attempt);
}

async function checkThrottle(runtime: ThrottleRuntime, attempt: LoginAttempt): Promise<ThrottleDecision | null> {
  const { store, clock } = runtime;
  const now = clock();
  const key = `${IP_PREFIX}${attempt.ip}`;
  const storedState = await store.get(key);
  const ipState = await readState({ store, key, now, windowMs: IP_WINDOW_MS });
  if (!storedState) {
    try {
      await store.set(key, ipState);
    } catch (error) {
      if (error instanceof ThrottleStoreFullError) {
        return decision({ until: now + STORE_FULL_RETRY_MS, now, reason: "global" });
      }
      throw error;
    }
  }
  if (ipState.lockoutUntil > now) return decision({ until: ipState.lockoutUntil, now, reason: "ip" });
  if (attempt.authenticated) return null;
  const globalState = await readState({ store, key: GLOBAL_KEY, now, windowMs: GLOBAL_WINDOW_MS });
  if (globalState.attempts.length > GLOBAL_ATTEMPT_LIMIT) {
    return decision({ until: globalState.attempts[0]! + GLOBAL_WINDOW_MS, now, reason: "global" });
  }
  return null;
}

async function recordGlobalFailure(input: TimedRuntime): Promise<void> {
  const { store, now } = input;
  const globalState = await readState({ store, key: GLOBAL_KEY, now, windowMs: GLOBAL_WINDOW_MS });
  globalState.attempts.push(now);
  await store.set(GLOBAL_KEY, globalState);
}

async function readState(query: StateQuery): Promise<ThrottleState> {
  const { store, key, now, windowMs } = query;
  const state = await store.get(key) ?? { attempts: [], lockoutUntil: 0, lockoutLevel: 0, lastLockoutAt: -1 };
  const attempts = state.attempts.filter((timestamp) => now - timestamp < windowMs);
  const next = { ...state, attempts };
  if (attempts.length !== state.attempts.length) await store.set(key, next);
  return next;
}

function isExpiredIpState(query: ExpiryQuery): boolean {
  const { key, state, now } = query;
  if (key === GLOBAL_KEY) return false;
  if (state.lockoutUntil > now) return false;
  if (state.attempts.some((timestamp) => now - timestamp < IP_WINDOW_MS)) return false;
  if (state.lastLockoutAt < 0) return true;
  return now - state.lastLockoutAt >= LOCKOUT_RESET_MS;
}

function isStaleLockout(state: ThrottleState, now: number): boolean {
  if (state.lastLockoutAt < 0) return false;
  return now - state.lastLockoutAt >= LOCKOUT_RESET_MS;
}

function decision(input: DecisionInput): ThrottleDecision {
  const { until, now, reason } = input;
  return { retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)), reason };
}
