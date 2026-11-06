import { NextResponse } from "next/server";
import { checkLoginRateLimit, clearLoginAttempts, loginAdmin, recordLoginAttempt } from "@/lib/admin-login";
import { respondWith } from "@/lib/admin-api";
import { ADMIN_SESSION_TTL_SECONDS, shouldUseSecureAdminCookie } from "@/lib/auth";

const MAX_LOGIN_BODY_BYTES = 4096;

export function getClientIp(req: Request): string | null {
  const cloudflareIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  if (process.env.NODE_ENV !== "production") return "unknown";
  return null;
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!ip) return throttledResponse(60);
  const lockout = await checkLoginRateLimit(ip);
  if (lockout) return throttledResponse(lockout.retryAfterSeconds);
  return processLogin(req, ip);
}

async function processLogin(req: Request, ip: string) {
  const payload = await readCappedJsonBody(req);
  if (payload.kind === "too-large") return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  if (payload.kind === "invalid") return respondWith(await loginAdmin(null));
  return verifyLogin(req, ip, payload.value);
}

async function verifyLogin(req: Request, ip: string, payload: unknown) {
  const result = await loginAdmin(payload);
  const failure = await failedLoginLimit(ip, result);
  if (failure) return throttledResponse(failure.retryAfterSeconds);
  return setLoginCookie(req, result, ip);
}

async function failedLoginLimit(ip: string, result: Awaited<ReturnType<typeof loginAdmin>>) {
  if (result.status !== 401) return null;
  return recordLoginAttempt(ip);
}

async function readCappedJsonBody(req: Request): Promise<{ kind: "body"; value: unknown } | { kind: "too-large" } | { kind: "invalid" }> {
  if (isOversizedContentLength(req)) return { kind: "too-large" };
  if (!req.body) return parseJson(new Uint8Array());

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAX_LOGIN_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        return { kind: "too-large" };
      }
      chunks.push(chunk.value);
    }
  } catch {
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return parseJson(bytes);
}

function isOversizedContentLength(req: Request): boolean {
  const contentLength = Number(req.headers.get("content-length"));
  if (!Number.isFinite(contentLength)) return false;
  return contentLength > MAX_LOGIN_BODY_BYTES;
}

function parseJson(bytes: Uint8Array): { kind: "body"; value: unknown } | { kind: "invalid" } {
  try {
    return { kind: "body", value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { kind: "invalid" };
  }
}

async function setLoginCookie(req: Request, result: Awaited<ReturnType<typeof loginAdmin>>, ip: string) {
  if (result.status !== 200) return respondWith(result);
  await clearLoginAttempts(ip);
  const response = respondWith(result);
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

function throttledResponse(retryAfterSeconds: number) {
  return NextResponse.json({ error: "Too many login attempts, please try again later" }, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}
