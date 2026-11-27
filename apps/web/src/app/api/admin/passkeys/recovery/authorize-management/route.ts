import { requireAdminAuth, getAdminTokenSessionId } from "@/lib/auth";
import { authorizeRecoverySessionForPasskeyManagement } from "@/lib/admin-passkeys";
import { authError, tokenFromRequest, tooManyAttempts } from "@/lib/admin-passkey-http";
import { readCappedJson } from "@/lib/admin-json";
import { checkLoginRateLimit, clearLoginAttempts, recordLoginAttempt } from "@/lib/admin-login";
import { getAdminClientIp } from "@/lib/admin-client-ip";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try { return await authorizeManagement(request); }
  catch { return Response.json({ error: "Admin authentication storage is unavailable" }, { status: 503 }); }
}

async function authorizeManagement(request: Request): Promise<Response> {
  const access = await recoveryManagementAccess(request);
  if (access instanceof Response) return access;
  const code = await readRecoveryManagementCode(request);
  if (code instanceof Response) return code;
  return confirmRecoveryManagement(access, code);
}

async function recoveryManagementAccess(request: Request): Promise<{ ip: string; sessionId: string } | Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return authError(auth.error, auth.status);
  if (auth.authMethod !== "recovery") return Response.json({ error: "This action is only available to a recovery session" }, { status: 409 });
  const ip = getAdminClientIp(request);
  if (!ip) return Response.json({ error: "Admin authentication is unavailable" }, { status: 503 });
  const locked = await checkLoginRateLimit({ ip });
  if (locked) return tooManyAttempts(locked.retryAfterSeconds);
  const token = tokenFromRequest(request);
  const sessionId = token ? await getAdminTokenSessionId({ token }) : null;
  if (!sessionId) return authError("Active admin session required", 401);
  return { ip, sessionId };
}

async function readRecoveryManagementCode(request: Request): Promise<string | Response> {
  const input = await readCappedJson(request, 1024);
  if (!input.ok) return Response.json({ error: input.error }, { status: input.status });
  if (!isCodeInput(input.value)) return Response.json({ error: "A second recovery code is required" }, { status: 400 });
  return input.value.code;
}

async function confirmRecoveryManagement(access: { ip: string; sessionId: string }, code: string): Promise<Response> {
  try {
    const authorized = await authorizeRecoverySessionForPasskeyManagement({ code, sessionId: access.sessionId });
    if (!authorized) return rejectedCode(access.ip, "Recovery code is invalid or the session has expired", 401);
    await clearLoginAttempts({ ip: access.ip });
    return Response.json({ authorized: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Admin authentication storage is unavailable" }, { status: 503 }); }
}

async function rejectedCode(ip: string, message: string, status: number): Promise<Response> {
  const throttle = await recordLoginAttempt({ ip });
  return Response.json({ error: throttle ? "Too many authentication attempts" : message }, {
    status: throttle ? 429 : status,
    headers: throttle ? { "Retry-After": String(throttle.retryAfterSeconds) } : { "Cache-Control": "no-store" },
  });
}

function isCodeInput(value: unknown): value is { code: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "code" in value && typeof value.code === "string" && value.code.length <= 64;
}
