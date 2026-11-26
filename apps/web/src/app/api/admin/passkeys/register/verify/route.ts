import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { getAdminTokenSessionId, requirePasskeyManagementAuth } from "@/lib/auth";
import { finishRegistration, PasskeyRegistrationConflictError, PasskeyRequestError, recordPasskeyFailure } from "@/lib/admin-passkeys";
import { authError, challengeIdFromRequest, clearChallengeCookie, tokenFromRequest } from "@/lib/admin-passkey-http";
import { readCappedJson } from "@/lib/admin-json";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const auth = await requirePasskeyManagementAuth(request);
  if (!auth.ok) return authError(auth.error, auth.status);
  return processRegistration(request);
}

async function processRegistration(request: Request): Promise<Response> {
  const parsed = await readRegistrationInput(request);
  if (parsed instanceof Response) return parsed;
  try {
    const result = await finishRegistration({ request, challengeId: parsed.challengeId, sessionId: parsed.sessionId, response: parsed.response });
    return clearChallengeCookie(NextResponse.json({ registered: true, recoveryCodes: result.recoveryCodes }, { headers: { "Cache-Control": "no-store" } }));
  } catch (error) {
    if (error instanceof PasskeyRequestError) return registrationFailure(error.message, 400);
    if (error instanceof PasskeyRegistrationConflictError) return clearChallengeCookie(NextResponse.json({ error: error.message }, { status: 409 }));
    return clearChallengeCookie(NextResponse.json({ error: "Admin authentication storage is unavailable" }, { status: 503 }));
  }
}

async function readRegistrationInput(request: Request): Promise<{ sessionId: string; challengeId: string; response: RegistrationResponseJSON } | Response> {
  const token = tokenFromRequest(request);
  const sessionId = token ? await getAdminTokenSessionId({ token }) : null;
  const challengeId = challengeIdFromRequest(request);
  if (!sessionId || !challengeId) {
    return registrationFailure("Registration challenge expired or unavailable", 400);
  }
  const input = await readCappedJson(request, 64 * 1024);
  if (!input.ok) {
    return registrationFailure(input.error, input.status);
  }
  if (!isRegistrationResponse(input.value)) {
    return registrationFailure("Invalid passkey response", 400);
  }
  return { sessionId, challengeId, response: input.value };
}

async function registrationFailure(message: string, status: number): Promise<Response> {
  await recordPasskeyFailure({ action: "passkey_registration" });
  return clearChallengeCookie(NextResponse.json({ error: message }, { status }));
}

function isRegistrationResponse(value: unknown): value is RegistrationResponseJSON {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "id" in value && typeof value.id === "string" && "response" in value;
}
