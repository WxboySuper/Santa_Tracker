import { createAdminToken, verifyAdminPassword } from "./auth";
import { getAdminPassword } from "./config";
import { badRequest, isRecord, type AdminApiResult } from "./admin-api";
import { createLoginThrottle } from "./admin-login-throttle";

const loginThrottle = createLoginThrottle();

export const checkLoginRateLimit = (ip: string) => loginThrottle.check({ ip });
export const checkLoginRateLimitNow = (ip: string) => loginThrottle.checkNow({ ip });
export const recordLoginAttempt = (ip: string) => loginThrottle.recordFailure({ ip });
export const clearLoginAttempts = (ip: string) => loginThrottle.clear({ ip });

export function loginAdmin(payload: unknown): AdminApiResult | Promise<AdminApiResult> {
  try {
    return issueSessionToken(payload);
  } catch {
    return badRequest("Invalid data format");
  }
}

function issueSessionToken(payload: unknown): AdminApiResult | Promise<AdminApiResult> {
  const password = extractPassword(payload);
  if (!password) return badRequest("Password required");
  const adminPassword = getAdminPassword();
  if (!adminPassword) {
    return { status: 500, body: { error: "Admin access not configured" } };
  }
  if (!verifyAdminPassword(password as string)) {
    return { status: 401, body: { error: "Invalid password" } };
  }
  return createAdminToken()
    .then((token) => ({ status: 200, body: { token } }))
    .catch(() => ({ status: 500, body: { error: "Failed to create session" } }));
}

function extractPassword(payload: unknown): unknown {
  if (!isRecord(payload)) return null;
  return payload.password;
}
