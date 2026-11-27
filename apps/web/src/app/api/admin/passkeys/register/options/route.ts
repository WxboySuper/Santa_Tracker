import { getAdminTokenSessionId, requirePasskeyManagementAuth } from "@/lib/auth";
import { recordPasskeyFailure, createRegistrationChallenge } from "@/lib/admin-passkeys";
import { authError, setChallengeCookie, tokenFromRequest } from "@/lib/admin-passkey-http";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const auth = await requirePasskeyManagementAuth(request);
  if (!auth.ok) return authError(auth.error, auth.status);
  const token = tokenFromRequest(request);
  const sessionId = token ? await getAdminTokenSessionId({ token }) : null;
  if (!sessionId) return authError("Active admin session required", 401);
  try {
    const result = await createRegistrationChallenge({ request, sessionId });
    const response = setChallengeCookie(NextResponse.json({ options: result.options }, { headers: { "Cache-Control": "no-store" } }), result.challenge.id);
    return response;
  } catch {
    try { await recordPasskeyFailure({ action: "passkey_registration_options" }); } catch { /* keep the storage error response if audit storage is unavailable */ }
    return Response.json({ error: "Unable to start passkey registration" }, { status: 503 });
  }
}
