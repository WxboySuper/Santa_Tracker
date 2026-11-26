import { checkLoginRateLimit, recordLoginAttempt } from "@/lib/admin-login";
import { createAuthenticationChallenge, recordPasskeyFailure, webAuthnSettings } from "@/lib/admin-passkeys";
import { setChallengeCookie, tooManyAttempts } from "@/lib/admin-passkey-http";
import { NextResponse } from "next/server";
import { getAdminClientIp } from "@/lib/admin-client-ip";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try { return await processLoginOptions(request); }
  catch { return storageUnavailable(); }
}

async function processLoginOptions(request: Request): Promise<Response> {
  const ip = getAdminClientIp(request);
  if (!ip) return throttled(60);
  const locked = await checkLoginRateLimit(ip);
  if (locked) return throttled(locked.retryAfterSeconds);
  return createOptions(request, ip);
}

function storageUnavailable(): Response {
  return NextResponse.json({ error: "Admin authentication storage is unavailable" }, { status: 503 });
}

async function createOptions(request: Request, ip: string): Promise<Response> {
  try {
    const settings = webAuthnSettings(request);
    if (request.headers.get("origin") !== settings.origin) return invalidOrigin();
    const throttle = await recordLoginAttempt(ip);
    if (throttle) return tooManyAttempts(throttle.retryAfterSeconds);
    const result = await createAuthenticationChallenge(request);
    return setChallengeCookie(NextResponse.json({ options: result.options }, { headers: { "Cache-Control": "no-store" } }), result.challenge.id);
  } catch (error) {
    await recordPasskeyFailure({ action: "passkey_login_options" });
    const status = error instanceof Error && error.message === "Passkey login is not configured" ? 409 : 503;
    return NextResponse.json({ error: status === 409 ? "Passkey login is not configured" : "Unable to start passkey login" }, { status });
  }
}

async function invalidOrigin(): Promise<Response> {
  await recordPasskeyFailure({ action: "passkey_login_origin_rejected" });
  return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
}

async function throttled(retryAfterSeconds: number): Promise<Response> {
  await recordPasskeyFailure({ action: "passkey_login_throttled" });
  return tooManyAttempts(retryAfterSeconds);
}
