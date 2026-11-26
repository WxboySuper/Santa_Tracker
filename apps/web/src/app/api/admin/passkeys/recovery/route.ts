import { checkLoginRateLimit, clearLoginAttempts, recordLoginAttempt } from "@/lib/admin-login";
import { recordPasskeyFailure, loginWithRecoveryCode, webAuthnSettings } from "@/lib/admin-passkeys";
import { readCappedJson } from "@/lib/admin-json";
import { responseWithSession, tooManyAttempts } from "@/lib/admin-passkey-http";
import { getAdminClientIp } from "@/lib/admin-client-ip";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const ip = getAdminClientIp(request);
  if (!ip) { await recordPasskeyFailure("recovery_login_throttled"); return tooManyAttempts(60); }
  const locked = await checkLoginRateLimit(ip);
  if (locked) { await recordPasskeyFailure("recovery_login_throttled"); return tooManyAttempts(locked.retryAfterSeconds); }
  try {
    const settings = webAuthnSettings(request);
    if (request.headers.get("origin") !== settings.origin) return failure(ip, "Invalid origin", 403);
  } catch { return Response.json({ error: "Authentication is not configured" }, { status: 503 }); }
  const input = await readCappedJson(request, 4096);
  if (!input.ok) return failure(ip, input.error, input.status);
  if (!isRecoveryInput(input.value)) return failure(ip, "A recovery code is required", 400);
  try {
    const token = await loginWithRecoveryCode(input.value.code);
    await clearLoginAttempts(ip);
    return responseWithSession(token, { authenticated: true, recoveryCodeUsed: true });
  } catch { return failure(ip, "Invalid recovery code", 401); }
}
async function failure(ip: string, message: string, status: number): Promise<Response> {
  await recordPasskeyFailure("recovery_login");
  const throttle = await recordLoginAttempt(ip);
  return Response.json({ error: throttle ? "Too many authentication attempts" : message }, {
    status: throttle ? 429 : status,
    headers: throttle ? { "Retry-After": String(throttle.retryAfterSeconds) } : { "Cache-Control": "no-store" },
  });
}

function isRecoveryInput(value: unknown): value is { code: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "code" in value && typeof value.code === "string" && value.code.length <= 64;
}

