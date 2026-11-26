import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { getAdminTokenSessionId, requireAdminAuth } from "@/lib/auth";
import { finishRegistration, recordPasskeyFailure } from "@/lib/admin-passkeys";
import { authError, challengeIdFromRequest, clearChallengeCookie, tokenFromRequest } from "@/lib/admin-passkey-http";
import { readCappedJson } from "@/lib/admin-json";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return authError(auth.error, auth.status);
  const token = tokenFromRequest(request);
  const sessionId = token ? await getAdminTokenSessionId(token) : null;
  const challengeId = challengeIdFromRequest(request);
  if (!sessionId || !challengeId) {
    await recordPasskeyFailure("passkey_registration");
    return Response.json({ error: "Registration challenge expired or unavailable" }, { status: 400 });
  }
  const input = await readCappedJson(request, 64 * 1024);
  if (!input.ok) {
    await recordPasskeyFailure("passkey_registration");
    return Response.json({ error: input.error }, { status: input.status });
  }
  if (!isRegistrationResponse(input.value)) {
    await recordPasskeyFailure("passkey_registration");
    return Response.json({ error: "Invalid passkey response" }, { status: 400 });
  }
  try {
    const result = await finishRegistration({ request, challengeId, sessionId, response: input.value });
    const response = clearChallengeCookie(NextResponse.json({ registered: true, recoveryCodes: result.recoveryCodes }, { headers: { "Cache-Control": "no-store" } }));
    return response;
  } catch (error) {
    await recordPasskeyFailure("passkey_registration");
    return clearChallengeCookie(NextResponse.json({ error: error instanceof Error ? error.message : "Unable to verify passkey" }, { status: 400 }));
  }
}

function isRegistrationResponse(value: unknown): value is RegistrationResponseJSON {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "id" in value && typeof value.id === "string" && "response" in value;
}
