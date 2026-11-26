import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { checkLoginRateLimit, clearLoginAttempts, recordLoginAttempt } from "@/lib/admin-login";
import { finishAuthentication, recordPasskeyFailure, webAuthnSettings } from "@/lib/admin-passkeys";
import { challengeIdFromRequest, clearChallengeCookie, responseWithSession, tooManyAttempts } from "@/lib/admin-passkey-http";
import { readCappedJson } from "@/lib/admin-json";
import { NextResponse } from "next/server";
import { getAdminClientIp } from "@/lib/admin-client-ip";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try { return await processLoginVerification(request); }
  catch { return NextResponse.json({ error: "Admin authentication storage is unavailable" }, { status: 503 }); }
}

async function processLoginVerification(request: Request): Promise<Response> {
  const ip = getAdminClientIp(request);
  if (!ip) { await recordPasskeyFailure({ action: "passkey_login_throttled" }); return tooManyAttempts(60); }
  const locked = await checkLoginRateLimit(ip);
  if (locked) { await recordPasskeyFailure({ action: "passkey_login_throttled" }); return tooManyAttempts(locked.retryAfterSeconds); }
  let settings: ReturnType<typeof webAuthnSettings>;
  try { settings = webAuthnSettings(request); }
  catch { return failed(ip, "Authentication is not configured", 503); }
  if (request.headers.get("origin") !== settings.origin) return failed(ip, "Invalid origin", 403);
  const challengeId = challengeIdFromRequest(request);
  const input = await readCappedJson(request, 64 * 1024);
  if (!input.ok) return failed(ip, input.error, input.status);
  if (!challengeId || !isAuthenticationResponse(input.value)) return failed(ip, "Invalid passkey response", 401);
  try {
    const token = await finishAuthentication({ request, challengeId, response: input.value });
    await clearLoginAttempts(ip);
    const response = await responseWithSession(token, { authenticated: true });
    return clearChallengeCookie(response);
  } catch {
    return failed(ip, "Invalid passkey response", 401);
  }
}
async function failed(ip: string, message: string, status: number): Promise<Response> {
  await recordPasskeyFailure({ action: "passkey_login" });
  const throttle = await recordLoginAttempt(ip);
  const response = NextResponse.json({ error: throttle ? "Too many authentication attempts" : message }, {
    status: throttle ? 429 : status,
    headers: throttle ? { "Retry-After": String(throttle.retryAfterSeconds) } : { "Cache-Control": "no-store" },
  });
  return clearChallengeCookie(response);
}

function isAuthenticationResponse(value: unknown): value is AuthenticationResponseJSON {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "id" in value && typeof value.id === "string" && "response" in value;
}

