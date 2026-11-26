import { requireAdminAuth, getAdminTokenSessionId } from "@/lib/auth";
import { authorizeRecoverySessionForPasskeyManagement } from "@/lib/admin-passkeys";
import { authError, tokenFromRequest } from "@/lib/admin-passkey-http";
import { readCappedJson } from "@/lib/admin-json";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return authError(auth.error, auth.status);
  if (auth.authMethod !== "recovery") return Response.json({ error: "This action is only available to a recovery session" }, { status: 409 });
  const token = tokenFromRequest(request);
  const sessionId = token ? await getAdminTokenSessionId({ token }) : null;
  if (!sessionId) return authError("Active admin session required", 401);
  const input = await readCappedJson(request, 1024);
  if (!input.ok) return Response.json({ error: input.error }, { status: input.status });
  if (!isCodeInput(input.value)) return Response.json({ error: "A second recovery code is required" }, { status: 400 });
  try {
    const authorized = await authorizeRecoverySessionForPasskeyManagement({ code: input.value.code, sessionId });
    if (!authorized) return Response.json({ error: "Recovery code is invalid or the session has expired" }, { status: 401 });
    return Response.json({ authorized: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Admin authentication storage is unavailable" }, { status: 503 });
  }
}

function isCodeInput(value: unknown): value is { code: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "code" in value && typeof value.code === "string" && value.code.length <= 64;
}
