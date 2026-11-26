import { requireAdminAuth } from "@/lib/auth";
import { readAdminAuthState } from "@/lib/admin-auth-state";
import { deleteRegisteredPasskey, recordPasskeyFailure, rotateRecoveryCodes } from "@/lib/admin-passkeys";
import { authError } from "@/lib/admin-passkey-http";
import { readCappedJson } from "@/lib/admin-json";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return authError(auth.error, auth.status);
  const state = await readAdminAuthState();
  return Response.json({ passkeys: state.passkeys.map(({ id, transports }) => ({ id, transports: transports ?? [] })), recoveryCodesRemaining: state.recoveryCodeHashes.length }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return authError(auth.error, auth.status);
  const input = await readCappedJson(request, 1024);
  if (!input.ok) return Response.json({ error: input.error }, { status: input.status });
  if (!isPasskeyInput(input.value)) return Response.json({ error: "A passkey ID is required" }, { status: 400 });
  try {
    const removed = await deleteRegisteredPasskey({ id: input.value.id });
    return Response.json({ removed }, { status: removed ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await recordPasskeyFailure({ action: "passkey_revoke" });
    return Response.json({ error: error instanceof Error ? error.message : "Unable to remove passkey" }, { status: 409 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return authError(auth.error, auth.status);
  try {
    const codes = await rotateRecoveryCodes();
    return Response.json({ recoveryCodes: codes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await recordPasskeyFailure({ action: "recovery_codes_rotate" });
    return Response.json({ error: error instanceof Error ? error.message : "Unable to rotate recovery codes" }, { status: 409 });
  }
}

function isPasskeyInput(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "id" in value && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 1024;
}
