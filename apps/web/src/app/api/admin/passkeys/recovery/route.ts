import { checkLoginRateLimit, clearLoginAttempts, recordLoginAttempt } from "@/lib/admin-login";
import { PasskeyRequestError, recordPasskeyFailure, loginWithRecoveryCode, webAuthnSettings } from "@/lib/admin-passkeys";
import { readCappedJson } from "@/lib/admin-json";
import { responseWithSession, tooManyAttempts } from "@/lib/admin-passkey-http";
import { ADMIN_CLIENT_IP_UNAVAILABLE, getAdminClientIp } from "@/lib/admin-client-ip";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try { return await processRecoveryLogin(request); }
  catch { return Response.json({ error: "Admin authentication storage is unavailable" }, { status: 503 }); }
}

async function processRecoveryLogin(request: Request): Promise<Response> {
  const ip = await recoveryClientIp(request);
  if (ip instanceof Response) return ip;
  const code = await readRecoveryCode(request, ip);
  if (code instanceof Response) return code;
  try {
    const token = await loginWithRecoveryCode({ code });
    await clearLoginAttempts(ip);
    return responseWithSession(token, { authenticated: true, recoveryCodeUsed: true });
  } catch (error) {
    if (error instanceof PasskeyRequestError && error.message === "Invalid recovery code") return failure(ip, "Invalid recovery code", 401);
    if (error instanceof PasskeyRequestError && error.message === "Recovery codes are not configured") {
      await recordPasskeyFailure({ action: "recovery_login_unconfigured" });
      return Response.json({ error: error.message }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Admin authentication storage is unavailable" }, { status: 503 });
  }
}

async function recoveryClientIp(request: Request): Promise<string | Response> {
  const ip = getAdminClientIp(request);
  if (!ip) return Response.json({ error: ADMIN_CLIENT_IP_UNAVAILABLE }, { status: 503 });
  const locked = await checkLoginRateLimit(ip);
  if (!locked) return ip;
  await recordPasskeyFailure({ action: "recovery_login_throttled" });
  return tooManyAttempts(locked.retryAfterSeconds);
}

async function readRecoveryCode(request: Request, ip: string): Promise<string | Response> {
  let origin: string;
  try { origin = webAuthnSettings(request).origin; }
  catch { return Response.json({ error: "Authentication is not configured" }, { status: 503 }); }
  if (request.headers.get("origin") !== origin) return failure(ip, "Invalid origin", 403);
  const input = await readCappedJson(request, 4096);
  if (!input.ok) return failure(ip, input.error, input.status);
  if (!isRecoveryInput(input.value)) return failure(ip, "A recovery code is required", 400);
  return input.value.code;
}
async function failure(ip: string, message: string, status: number): Promise<Response> {
  await recordPasskeyFailure({ action: "recovery_login" });
  const throttle = await recordLoginAttempt(ip);
  return Response.json({ error: throttle ? "Too many authentication attempts" : message }, {
    status: throttle ? 429 : status,
    headers: throttle ? { "Retry-After": String(throttle.retryAfterSeconds) } : { "Cache-Control": "no-store" },
  });
}

function isRecoveryInput(value: unknown): value is { code: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "code" in value && typeof value.code === "string" && value.code.length <= 64;
}

