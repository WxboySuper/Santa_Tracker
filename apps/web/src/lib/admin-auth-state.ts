import { getSantaSnapshotsBucket } from "./cloudflare-bindings";
import { withWriteLock } from "./file-lock";
import { getKeyValueStore } from "./storage";

const STATE_KEY = "admin-auth/state.json";
const MAX_AUDIT_EVENTS = 200;
const MAX_SESSIONS = 500;
const MAX_CHALLENGES = 10;

export interface StoredPasskey {
  id: string;
  publicKey: string;
  counter: number;
  transports?: string[];
}

export interface AdminSessionRecord {
  id: string;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export interface AdminAuthChallenge {
  id: string;
  challenge: string;
  purpose: "registration" | "authentication";
  sessionId: string | null;
  expiresAt: number;
}

export interface AdminAuthAuditEvent {
  action: string;
  result: "success" | "failure";
  at: string;
  sessionId?: string;
}

export interface AdminAuthState {
  version: 1;
  passkeys: StoredPasskey[];
  recoveryCodeHashes: string[];
  sessions: AdminSessionRecord[];
  challenges: AdminAuthChallenge[];
  audit: AdminAuthAuditEvent[];
}

type StateAdapter = { read(): Promise<string | null>; write(value: string): Promise<void> };
let testState: AdminAuthState = emptyState();

function emptyState(): AdminAuthState {
  return { version: 1, passkeys: [], recoveryCodeHashes: [], sessions: [], challenges: [], audit: [] };
}

function getAdapter(): StateAdapter {
  if (process.env.NODE_ENV === "test") {
    return {
      async read() { return JSON.stringify(testState); },
      async write(value) { testState = parseState(value); },
    };
  }
  const bucket = getSantaSnapshotsBucket();
  const store = getKeyValueStore(bucket);
  return { read: () => store.read(STATE_KEY), write: value => store.write(STATE_KEY, value) };
}

function parseState(raw: string | null): AdminAuthState {
  if (!raw) return emptyState();
  const value = parseJsonState(raw);
  if (!isAdminAuthState(value)) throw corruptStateError();
  return {
    version: 1,
    passkeys: value.passkeys.slice(0, 10),
    recoveryCodeHashes: value.recoveryCodeHashes,
    sessions: value.sessions,
    challenges: value.challenges,
    audit: value.audit.slice(-MAX_AUDIT_EVENTS),
  };
}

function parseJsonState(raw: string): unknown {
  try { return JSON.parse(raw); }
  catch { throw corruptStateError(); }
}

function isAdminAuthState(value: unknown): value is AdminAuthState {
  return isRecord(value)
    && value.version === 1
    && hasValidCollections(value)
    && value.passkeys.length <= 10
    && value.recoveryCodeHashes.length <= 10
    && value.passkeys.every(isStoredPasskey)
    && value.sessions.every(isSession)
    && value.challenges.every(isChallenge)
    && value.audit.every(isAuditEvent)
    && value.recoveryCodeHashes.every(item => typeof item === "string");
}

function hasValidCollections(value: Record<string, unknown>): value is Record<string, unknown> & {
  passkeys: unknown[];
  sessions: unknown[];
  challenges: unknown[];
  audit: unknown[];
  recoveryCodeHashes: unknown[];
} {
  return Array.isArray(value.passkeys)
    && Array.isArray(value.sessions)
    && Array.isArray(value.challenges)
    && Array.isArray(value.audit)
    && Array.isArray(value.recoveryCodeHashes);
}

function corruptStateError(): Error {
  return new Error("Admin authentication state is corrupt");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredPasskey(value: unknown): value is StoredPasskey {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length < 1 || value.id.length > 1024) return false;
  if (typeof value.publicKey !== "string" || !/^[A-Za-z0-9_-]+$/.test(value.publicKey)) return false;
  if (!Number.isSafeInteger(value.counter) || (value.counter as number) < 0) return false;
  return value.transports === undefined || (Array.isArray(value.transports) && value.transports.every(item => typeof item === "string"));
}

function isSession(value: unknown): value is AdminSessionRecord {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && typeof value.csrfToken === "string" && typeof value.createdAt === "number" && Number.isSafeInteger(value.createdAt) && typeof value.expiresAt === "number" && Number.isSafeInteger(value.expiresAt) && value.expiresAt > value.createdAt && (value.revokedAt === null || (typeof value.revokedAt === "number" && Number.isSafeInteger(value.revokedAt)));
}

function isChallenge(value: unknown): value is AdminAuthChallenge {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && typeof value.challenge === "string" && (value.purpose === "registration" || value.purpose === "authentication") && (value.sessionId === null || typeof value.sessionId === "string") && Number.isSafeInteger(value.expiresAt);
}

function isAuditEvent(value: unknown): value is AdminAuthAuditEvent {
  if (!isRecord(value)) return false;
  return typeof value.action === "string" && value.action.length <= 80 && (value.result === "success" || value.result === "failure") && typeof value.at === "string" && !Number.isNaN(Date.parse(value.at));
}

async function mutateState<T>(update: (state: AdminAuthState) => T | Promise<T>): Promise<T> {
  return withWriteLock(async () => {
    const adapter = getAdapter();
    const state = parseState(await adapter.read());
    const result = await update(state);
    state.sessions = state.sessions.filter(session => session.expiresAt > Date.now()).slice(-MAX_SESSIONS);
    state.challenges = state.challenges.filter(challenge => challenge.expiresAt > Date.now()).slice(-MAX_CHALLENGES);
    state.audit = state.audit.slice(-MAX_AUDIT_EVENTS);
    await adapter.write(JSON.stringify(state));
    return result;
  });
}

export async function readAdminAuthState(): Promise<AdminAuthState> {
  return parseState(await getAdapter().read());
}

export async function appendAuthAudit(event: Omit<AdminAuthAuditEvent, "at"> & { at?: string }): Promise<void> {
  await mutateState(state => { state.audit.push({ ...event, at: event.at ?? new Date().toISOString() }); });
}

export async function createAdminSession(now = Date.now(), ttlSeconds = 12 * 60 * 60): Promise<AdminSessionRecord> {
  const session: AdminSessionRecord = { id: crypto.randomUUID(), csrfToken: randomToken(), createdAt: now, expiresAt: now + ttlSeconds * 1000, revokedAt: null };
  await mutateState(state => { state.sessions.push(session); });
  return session;
}

export async function readActiveSession(id: string, now = Date.now()): Promise<AdminSessionRecord | null> {
  const session = (await readAdminAuthState()).sessions.find(item => item.id === id);
  return session && session.revokedAt === null && session.expiresAt > now ? session : null;
}

export async function revokeAdminSession(id: string, now = Date.now()): Promise<boolean> {
  return mutateState(state => {
    const session = state.sessions.find(item => item.id === id);
    if (!session || session.revokedAt !== null) return false;
    session.revokedAt = now;
    return true;
  });
}

export async function saveAuthChallenge(challenge: AdminAuthChallenge): Promise<void> {
  await mutateState(state => { state.challenges = state.challenges.filter(item => item.id !== challenge.id); state.challenges.push(challenge); });
}

export async function consumeAuthChallenge(id: string, purpose: AdminAuthChallenge["purpose"], now = Date.now()): Promise<AdminAuthChallenge | null> {
  return mutateState(state => {
    const challenge = state.challenges.find(item => item.id === id && item.purpose === purpose && item.expiresAt > now);
    state.challenges = state.challenges.filter(item => item.id !== id);
    return challenge ?? null;
  });
}

export async function installPasskey(passkey: StoredPasskey, recoveryCodeHashes: string[] | null): Promise<void> {
  await mutateState(state => {
    if (state.passkeys.some(item => item.id === passkey.id)) throw new Error("Passkey is already registered");
    if (state.passkeys.length >= 10) throw new Error("Passkey limit reached");
    state.passkeys.push(passkey);
    if (recoveryCodeHashes) state.recoveryCodeHashes = recoveryCodeHashes;
  });
}

export async function readPasskey(id: string): Promise<StoredPasskey | null> {
  return (await readAdminAuthState()).passkeys.find(item => item.id === id) ?? null;
}

export async function updatePasskeyCounter(id: string, counter: number): Promise<void> {
  await mutateState(state => { const passkey = state.passkeys.find(item => item.id === id); if (passkey) passkey.counter = counter; });
}

export async function deletePasskey(id: string): Promise<boolean> {
  return mutateState(state => {
    const index = state.passkeys.findIndex(item => item.id === id);
    if (index < 0) return false;
    if (state.passkeys.length <= 1) throw new Error("At least one passkey must remain registered");
    state.passkeys.splice(index, 1);
    return true;
  });
}

export async function replaceRecoveryCodes(hashes: string[]): Promise<void> {
  await mutateState(state => { state.recoveryCodeHashes = hashes; });
}

export async function consumeRecoveryCode(hash: string): Promise<boolean> {
  return mutateState(state => {
    const index = state.recoveryCodeHashes.indexOf(hash);
    if (index < 0) return false;
    state.recoveryCodeHashes.splice(index, 1);
    return true;
  });
}

export async function listActiveAdminSessions(now = Date.now()): Promise<AdminSessionRecord[]> {
  return (await readAdminAuthState()).sessions.filter(session => session.revokedAt === null && session.expiresAt > now);
}

export async function resetAdminAuthStateForTests(): Promise<void> {
  testState = emptyState();
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
