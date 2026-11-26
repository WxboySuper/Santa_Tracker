import { createAdminToken, verifyAdminPassword } from "./auth";
import { getAdminPassword } from "./config";
import { badRequest, isRecord, type AdminApiResult } from "./admin-api";
import { createLoginThrottle, InMemoryThrottleStore, ThrottleStoreFullError, type ThrottleState, type ThrottleStore } from "./admin-login-throttle";
import { appendAuthAudit, readAdminAuthState } from "./admin-auth-state";
import { getSantaSnapshotsBucket } from "./cloudflare-bindings";
import { withWriteLock } from "./file-lock";
import { getKeyValueStore, type KeyValueStore } from "./storage";

const loginThrottle = createLoginThrottle({ store: createThrottleStore() });

export const checkLoginRateLimit = (ip: string) => loginThrottle.check({ ip });
export const checkLoginRateLimitNow = (ip: string) => loginThrottle.checkNow({ ip });
export const recordLoginAttempt = (ip: string) => loginThrottle.recordFailure({ ip });
export const clearLoginAttempts = (ip: string) => loginThrottle.clear({ ip });
const recordedFailures = new WeakSet<object>();

export function wasLoginAttemptRecorded(result: AdminApiResult): boolean {
  return recordedFailures.has(result);
}

function createThrottleStore(): ThrottleStore {
  if (process.env.NODE_ENV === "test") return new InMemoryThrottleStore();
  return new PersistentAdminThrottleStore(() => getKeyValueStore(getSantaSnapshotsBucket()), withWriteLock);
}

export class PersistentAdminThrottleStore implements ThrottleStore {
  constructor(private readonly source: KeyValueStore | (() => KeyValueStore), private readonly lock: <T>(action: () => Promise<T>) => Promise<T>) {}

  private get store(): KeyValueStore {
    return typeof this.source === "function" ? this.source() : this.source;
  }

  async get({ key }: { key: string }): Promise<ThrottleState | undefined> {
    return cloneState(readThrottleMap(await this.store.read(THROTTLE_KEY))[key]);
  }

  async set({ key, value }: { key: string; value: ThrottleState }): Promise<void> {
    await this.update({ key, transform: () => value });
  }

  async delete({ key }: { key: string }): Promise<void> {
    await this.lock(async () => {
      const values = readThrottleMap(await this.store.read(THROTTLE_KEY));
      Reflect.deleteProperty(values, key);
      await this.store.write(THROTTLE_KEY, JSON.stringify(values));
    });
  }

  async update({ key, transform }: { key: string; transform: (current: ThrottleState | undefined) => ThrottleState }): Promise<ThrottleState> {
    return this.lock(async () => {
      const values = readThrottleMap(await this.store.read(THROTTLE_KEY));
      const current = values[key];
      if (!current && Object.keys(values).length >= MAX_THROTTLE_KEYS) evictThrottleEntry(values);
      const next = transform(cloneState(current));
      values[key] = next;
      await this.store.write(THROTTLE_KEY, JSON.stringify(values));
      return cloneState(next)!;
    });
  }
}

const THROTTLE_KEY = "admin-auth/login-throttle.json";
const MAX_THROTTLE_KEYS = 10_000;

function readThrottleMap(raw: string | null): Record<string, ThrottleState> {
  if (!raw) return {};
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error("Admin login throttle state is corrupt"); }
  if (!isRecord(value)) throw new Error("Admin login throttle state is corrupt");
  for (const state of Object.values(value)) if (!isThrottleState(state)) throw new Error("Admin login throttle state is corrupt");
  return value as Record<string, ThrottleState>;
}

function isThrottleState(value: unknown): value is ThrottleState {
  return isRecord(value) && Array.isArray(value.attempts) && value.attempts.every(item => typeof item === "number" && Number.isSafeInteger(item)) && Number.isSafeInteger(value.lockoutUntil) && Number.isSafeInteger(value.lockoutLevel) && Number.isSafeInteger(value.lastLockoutAt);
}

function cloneState(value: ThrottleState | undefined): ThrottleState | undefined {
  return value ? { ...value, attempts: [...value.attempts] } : undefined;
}

function evictThrottleEntry(values: Record<string, ThrottleState>): void {
  const now = Date.now();
  const candidates = Object.entries(values).filter(([, state]) => state.lockoutUntil <= now);
  candidates.sort((left, right) => latestAttempt(left[1]) - latestAttempt(right[1]));
  const candidate = candidates[0]?.[0];
  if (!candidate) throw new ThrottleStoreFullError();
  Reflect.deleteProperty(values, candidate);
}

function latestAttempt(state: ThrottleState): number {
  return state.attempts.at(-1) ?? state.lastLockoutAt;
}

export async function loginAdmin(payload: unknown, ip?: string): Promise<AdminApiResult> {
  try {
    return await issueSessionToken(payload, ip);
  } catch (error) {
    console.error("Admin login internal error", error);
    return { status: 503, body: { error: "Admin authentication storage is unavailable" } };
  }
}

async function issueSessionToken(payload: unknown, ip?: string): Promise<AdminApiResult> {
  const password = extractPassword(payload);
  if (!password) {
    await appendAuthAudit({ action: "password_login", result: "failure" });
    return badRequest("Password required");
  }
  if (ip) {
    const lockout = checkLoginRateLimitNow(ip);
    if (lockout) return { status: 429, body: { error: "Too many login attempts, please try again later" } };
  }
  const adminPassword = getAdminPassword();
  if (!adminPassword) {
    return { status: 500, body: { error: "Admin access not configured" } };
  }
  if (!verifyAdminPassword({ password: password as string })) return rejectPasswordLogin(ip, "password_login", true);
  if ((await readAdminAuthState()).passkeys.length > 0) return rejectPasswordLogin(ip, "password_login_disabled", false);
  try {
    const token = await createAdminToken();
    await appendAuthAudit({ action: "password_login", result: "success" });
    return { status: 200, body: { token } };
  } catch {
    return { status: 500, body: { error: "Failed to create session" } };
  }
}

async function rejectPasswordLogin(ip: string | undefined, action: string, equalizeStateRead: boolean): Promise<AdminApiResult> {
  const result: AdminApiResult = { status: 401, body: { error: "Invalid password" } };
  recordedFailures.add(result);
  const limit = ip ? await recordLoginAttempt(ip) : null;
  if (equalizeStateRead) await readAdminAuthState();
  await appendAuthAudit({ action, result: "failure" });
  return limit ? { status: 429, body: { error: "Too many login attempts, please try again later" } } : result;
}

function extractPassword(payload: unknown): unknown {
  if (!isRecord(payload)) return null;
  return payload.password;
}
