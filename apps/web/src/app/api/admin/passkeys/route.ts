import { requireAdminAuth, requirePasskeyManagementAuth } from "@/lib/auth";
import { readAdminAuthState } from "@/lib/admin-auth-state";
import { deleteRegisteredPasskey, recordPasskeyFailure, rotateRecoveryCodes } from "@/lib/admin-passkeys";
import { authError } from "@/lib/admin-passkey-http";
import { readCappedJson } from "@/lib/admin-json";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return authError(auth.error, auth.status);
  try {
    const state = await readAdminAuthState();
    return Response.json({ passkeys: state.passkeys.map(({ id, transports }) => ({ id, transports: transports ?? [] })), recoveryCodesRemaining: state.recoveryCodeHashes.length }, { headers: { "Cache-Control": "no-store" } });
  } catch { return unavailable(); }
}

export async function DELETE(request: Request): Promise<Response> {
  const auth = await requirePasskeyManagementAuth(request);
  if (!auth.ok) return authError(auth.error, auth.status);
  const input = await readCappedJson(request, 1024);
  if (!input.ok) return Response.json({ error: input.error }, { status: input.status });
  if (!isPasskeyInput(input.value)) return Response.json({ error: "A passkey ID is required" }, { status: 400 });
  try {
    const removed = await deleteRegisteredPasskey({ id: input.value.id });
    return Response.json({ removed }, { status: removed ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "At least one passkey must remain registered") {
      await recordPasskeyFailure({ action: "passkey_revoke" });
      return Response.json({ error: error.message }, { status: 409 });
    }
    return unavailable();
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requirePasskeyManagementAuth(request);
  if (!auth.ok) return authError(auth.error, auth.status);
  try {
    const codes = await rotateRecoveryCodes();
    return Response.json({ recoveryCodes: codes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Register a passkey before creating recovery codes") {
      await recordPasskeyFailure({ action: "recovery_codes_rotate" });
      return Response.json({ error: error.message }, { status: 409 });
    }
    return unavailable();
  }
}

function unavailable(): Response {
  return Response.json({ error: "Admin authentication storage is unavailable" }, { status: 503 });
}

function isPasskeyInput(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "id" in value && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 1024;
}
