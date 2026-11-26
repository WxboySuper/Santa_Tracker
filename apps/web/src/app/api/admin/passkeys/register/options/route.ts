import { getAdminTokenSessionId, requireAdminAuth } from "@/lib/auth";
import { recordPasskeyFailure, createRegistrationChallenge } from "@/lib/admin-passkeys";
import { authError, setChallengeCookie, tokenFromRequest } from "@/lib/admin-passkey-http";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return authError(auth.error, auth.status);
  const token = tokenFromRequest(request);
  const sessionId = token ? await getAdminTokenSessionId(token) : null;
  if (!sessionId) return authError("Active admin session required", 401);
  try {
    const result = await createRegistrationChallenge(request, sessionId);
    const response = setChallengeCookie(NextResponse.json({ options: result.options }, { headers: { "Cache-Control": "no-store" } }), result.challenge.id);
    return response;
  } catch (error) {
    await recordPasskeyFailure("passkey_registration_options");
    return Response.json({ error: error instanceof Error ? error.message : "Unable to start passkey registration" }, { status: 503 });
  }
}
