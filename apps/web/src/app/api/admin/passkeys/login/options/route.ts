import { checkLoginRateLimit, recordLoginAttempt } from "@/lib/admin-login";
import { createAuthenticationChallenge, recordPasskeyFailure, webAuthnSettings } from "@/lib/admin-passkeys";
import { setChallengeCookie, tooManyAttempts } from "@/lib/admin-passkey-http";
import { NextResponse } from "next/server";
import { getAdminClientIp } from "@/lib/admin-client-ip";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const ip = getAdminClientIp(request);
  if (!ip) { await recordPasskeyFailure("passkey_login_throttled"); return tooManyAttempts(60); }
  const locked = await checkLoginRateLimit(ip);
  if (locked) { await recordPasskeyFailure("passkey_login_throttled"); return tooManyAttempts(locked.retryAfterSeconds); }
  try {
    const settings = webAuthnSettings(request);
    if (request.headers.get("origin") !== settings.origin) {
      await recordPasskeyFailure("passkey_login_origin_rejected");
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
    const result = await createAuthenticationChallenge(request);
    return setChallengeCookie(NextResponse.json({ options: result.options }, { headers: { "Cache-Control": "no-store" } }), result.challenge.id);
  } catch (error) {
    await recordPasskeyFailure("passkey_login_options");
    const status = error instanceof Error && error.message === "Passkey login is not configured" ? 409 : 503;
    return NextResponse.json({ error: status === 409 ? "Passkey login is not configured" : "Unable to start passkey login" }, { status });
  }
}
