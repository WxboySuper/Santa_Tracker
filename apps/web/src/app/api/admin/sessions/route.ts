import { requireAdminAuth, getAdminTokenSessionId } from "@/lib/auth";
import { appendAuthAudit, listActiveAdminSessions, revokeAdminSession } from "@/lib/admin-auth-state";
import { readCappedJson } from "@/lib/admin-json";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await authorize(request);
  if (denied) return denied;
  try {
    const currentId = await getAdminTokenSessionId({ token: getRequestToken(request) });
    const sessions = await listActiveAdminSessions();
    return Response.json({ sessions: sessions.map(({ id, createdAt, expiresAt }) => ({ id, createdAt, expiresAt, current: id === currentId })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return storageUnavailable(); }
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = await authorize(request);
  if (denied) return denied;
  const input = await readCappedJson(request, 1024);
  if (!input.ok) return Response.json({ error: input.error }, { status: input.status });
  if (!isSessionInput(input.value)) return Response.json({ error: "A session ID is required" }, { status: 400 });
  try {
    const currentId = await getAdminTokenSessionId({ token: getRequestToken(request) });
    if (input.value.sessionId === currentId) return Response.json({ error: "Use logout to end the current session" }, { status: 400 });
    const revoked = await revokeAdminSession(input.value.sessionId);
    if (!revoked) return Response.json({ error: "Session not found or already revoked" }, { status: 404 });
    await appendAuthAudit({ action: "session_revoke", result: "success", sessionId: input.value.sessionId });
    return Response.json({ revoked: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return storageUnavailable(); }
}

function storageUnavailable(): Response {
  return Response.json({ error: "Admin authentication storage is unavailable" }, { status: 503 });
}

async function authorize(request: Request): Promise<Response | null> {
  const auth = await requireAdminAuth(request);
  return auth.ok ? null : Response.json({ error: auth.error }, { status: auth.status });
}

function isSessionInput(value: unknown): value is { sessionId: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "sessionId" in value && typeof value.sessionId === "string" && /^[0-9a-f-]{36}$/i.test(value.sessionId);
}

function getRequestToken(request: Request): string {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const match = /(?:^|;\s*)admin_token=([^;]*)/.exec(request.headers.get("cookie") ?? "");
  if (!match?.[1]) return "";
  try { return decodeURIComponent(match[1]); }
  catch { return ""; }
}
