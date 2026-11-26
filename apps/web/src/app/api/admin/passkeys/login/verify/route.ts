import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { checkLoginRateLimit, clearLoginAttempts, recordLoginAttempt } from "@/lib/admin-login";
import { finishAuthentication, PasskeyRequestError, recordPasskeyFailure, webAuthnSettings } from "@/lib/admin-passkeys";
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
  const ip = await requestIp(request);
  if (ip instanceof Response) return ip;
  const parsed = await readAuthenticationRequest(request, ip);
  if (parsed instanceof Response) return parsed;
  try {
    const token = await finishAuthentication({ request, challengeId: parsed.challengeId, response: parsed.response });
    await clearLoginAttempts(parsed.ip);
    await clearLoginAttempts(`passkey-options:${parsed.ip}`);
    const response = await responseWithSession(token, { authenticated: true });
    return clearChallengeCookie(response);
  } catch (error) {
    if (error instanceof PasskeyRequestError) return failed(parsed.ip, "Invalid passkey response", 401);
    return NextResponse.json({ error: "Admin authentication storage is unavailable" }, { status: 503 });
  }
}

async function requestIp(request: Request): Promise<string | Response> {
  const ip = getAdminClientIp(request);
  if (!ip) return NextResponse.json({ error: "Admin authentication is unavailable" }, { status: 503 });
  const locked = await checkLoginRateLimit(ip);
  if (!locked) return ip;
  await recordPasskeyFailure({ action: "passkey_login_throttled" });
  return tooManyAttempts(locked.retryAfterSeconds);
}

async function readAuthenticationRequest(request: Request, ip: string): Promise<{ ip: string; challengeId: string; response: AuthenticationResponseJSON } | Response> {
  const settings = await getRequestSettings(request, ip);
  if (settings instanceof Response) return settings;
  const challengeId = challengeIdFromRequest(request);
  const input = await readCappedJson(request, 64 * 1024);
  if (!input.ok) return failed(ip, input.error, input.status);
  if (!challengeId || !isAuthenticationResponse(input.value)) return failed(ip, "Invalid passkey response", 401);
  return { ip, challengeId, response: input.value };
}

async function getRequestSettings(request: Request, ip: string): Promise<ReturnType<typeof webAuthnSettings> | Response> {
  let settings: ReturnType<typeof webAuthnSettings>;
  try { settings = webAuthnSettings(request); }
  catch { return failed(ip, "Authentication is not configured", 503); }
  return request.headers.get("origin") === settings.origin ? settings : failed(ip, "Invalid origin", 403);
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

