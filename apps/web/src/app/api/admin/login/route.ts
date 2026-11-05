import { NextResponse } from "next/server";
import { checkLoginRateLimit, clearLoginAttempts, loginAdmin, recordLoginAttempt } from "@/lib/admin-login";
import { respondWith } from "@/lib/admin-api";
import { ADMIN_SESSION_TTL_SECONDS, requireAdminAuth, shouldUseSecureAdminCookie } from "@/lib/auth";

const loginQueues = new Map<string, Promise<void>>();
const pendingLogins = new Map<string, number>();
const MAX_PENDING_LOGINS_PER_IP = 64;
const MAX_LOGIN_BODY_BYTES = 4096;

export function getClientIp(req: Request): string {
  const cloudflareIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  return serializeLogin(ip, () => handleLoginRequest(req, ip));
}

export function serializeLogin(ip: string, task: () => Promise<NextResponse>): Promise<NextResponse> {
  const pendingCount = pendingLogins.get(ip) ?? 0;
  if (pendingCount >= MAX_PENDING_LOGINS_PER_IP) return Promise.resolve(throttledResponse(1));
  pendingLogins.set(ip, pendingCount + 1);
  const previous = loginQueues.get(ip) ?? Promise.resolve();
  const current = previous.then(task, task);
  const tail = current.then(() => undefined, () => undefined);
  loginQueues.set(ip, tail);
  return current.finally(() => {
    const remaining = (pendingLogins.get(ip) ?? 1) - 1;
    if (remaining > 0) {
      pendingLogins.set(ip, remaining);
      return;
    }
    pendingLogins.delete(ip);
    if (loginQueues.get(ip) === tail) loginQueues.delete(ip);
  });
}

async function handleLoginRequest(req: Request, ip: string): Promise<NextResponse> {
  const ipLimit = await checkLoginRateLimit(ip, true);
  if (ipLimit) return throttledResponse(ipLimit.retryAfterSeconds);

  const existingSession = await requireAdminAuth(req);
  const limited = await checkLoginRateLimit(ip, existingSession.ok);
  if (limited) return throttledResponse(limited.retryAfterSeconds);

  const parsed = await readCappedJsonBody(req);
  if (parsed.tooLarge) return NextResponse.json({ error: "Request body too large" }, { status: 413 });

  return handleLogin(req, ip, existingSession.ok, parsed.payload);
}

async function handleLogin(req: Request, ip: string, authenticated: boolean, payload: unknown): Promise<NextResponse> {
  const result = await loginAdmin(payload);
  if (result.status === 401) {
    const failureLimit = await recordLoginAttempt(ip, authenticated);
    if (failureLimit) return throttledResponse(failureLimit.retryAfterSeconds);
  } else if (result.status === 200) {
    await clearLoginAttempts(ip);
  }

  const response = respondWith(result);
  if (result.status !== 200) return response;
  const token = result.body.token;
  if (typeof token !== "string") return response;
  response.cookies.set("admin_token", token, {
    httpOnly: true,
    secure: shouldUseSecureAdminCookie(req),
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
  return response;
}

async function readCappedJsonBody(req: Request): Promise<{ payload: unknown; tooLarge: boolean }> {
  if (hasOversizedContentLength(req)) return { payload: null, tooLarge: true };
  if (!req.body) return { payload: null, tooLarge: false };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAX_LOGIN_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { payload: null, tooLarge: true };
      }
      chunks.push(chunk.value);
    }
  } catch {
    return { payload: null, tooLarge: false };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { payload: JSON.parse(new TextDecoder().decode(bytes)), tooLarge: false };
  } catch {
    return { payload: null, tooLarge: false };
  }
}

function hasOversizedContentLength(req: Request): boolean {
  const header = req.headers.get("content-length");
  if (!header) return false;
  const contentLength = Number(header);
  if (!Number.isFinite(contentLength)) return false;
  return contentLength > MAX_LOGIN_BODY_BYTES;
}

function throttledResponse(retryAfterSeconds: number) {
  return NextResponse.json({ error: "Too many login attempts, please try again later" }, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}
