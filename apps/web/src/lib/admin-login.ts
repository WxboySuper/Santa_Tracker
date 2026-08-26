import { createAdminToken, verifyAdminPassword } from "./auth";
import { getAdminPassword } from "./config";
import { badRequest, isRecord, type AdminApiResult } from "./admin-api";

// Simple in-memory rate limiter for login (per-process, best-effort).
// Production deployments should enforce rate limiting at the edge/WAF.
const loginAttempts = new Map<string, number[]>();
const LOGIN_WINDOW_MS = 60_000;
const MAX_LOGIN_ATTEMPTS = 10;

export function checkLoginRateLimit(ip: string): AdminApiResult | null {
  const now = Date.now();
  const attempts = loginAttempts.get(ip) ?? [];
  const recent = attempts.filter((timestamp) => now - timestamp < LOGIN_WINDOW_MS);
  // prune stale entries
  if (recent.length !== attempts.length) loginAttempts.set(ip, recent);
  if (recent.length >= MAX_LOGIN_ATTEMPTS) {
    return { status: 429, body: { error: "Too many login attempts, please try again later" } };
  }
  return null;
}

export function recordLoginAttempt(ip: string): void {
  const list = loginAttempts.get(ip) ?? [];
  list.push(Date.now());
  loginAttempts.set(ip, list);
}

export function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

export async function loginAdmin(payload: unknown): Promise<AdminApiResult> {
  try {
    return await issueSessionToken(payload);
  } catch {
    return badRequest("Invalid data format");
  }
}

async function issueSessionToken(payload: unknown): Promise<AdminApiResult> {
  const password = extractPassword(payload);
  if (!password) return badRequest("Password required");
  const adminPassword = getAdminPassword();
  if (!adminPassword) {
    return { status: 500, body: { error: "Admin access not configured" } };
  }
  if (!(await verifyAdminPassword(password as string))) {
    return { status: 401, body: { error: "Invalid password" } };
  }
  const token = await createAdminToken();
  return { status: 200, body: { token } };
}

function extractPassword(payload: unknown): unknown {
  if (!isRecord(payload)) return null;
  return payload.password;
}
