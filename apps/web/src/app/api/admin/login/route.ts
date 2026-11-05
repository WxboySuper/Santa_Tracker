import { NextResponse } from "next/server";
import { checkLoginRateLimit, clearLoginAttempts, loginAdmin, recordLoginAttempt } from "@/lib/admin-login";
import { readJsonBody, respondWith } from "@/lib/admin-api";
import { ADMIN_SESSION_TTL_SECONDS, requireAdminAuth, shouldUseSecureAdminCookie } from "@/lib/auth";

let loginQueue: Promise<void> = Promise.resolve();
let pendingLoginCount = 0;
const MAX_PENDING_LOGINS = 64;

export function getClientIp(req: Request): string {
  const cloudflareIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const existingSession = await requireAdminAuth(req);
  const payload = await readJsonBody(req);
  return serializeLogin(() => handleLogin(req, ip, existingSession.ok, payload));
}

function serializeLogin(task: () => Promise<NextResponse>): Promise<NextResponse> {
  if (pendingLoginCount >= MAX_PENDING_LOGINS) return Promise.resolve(throttledResponse(1));
  pendingLoginCount += 1;
  const current = loginQueue.then(task, task);
  loginQueue = current.then(() => undefined, () => undefined);
  return current.finally(() => {
    pendingLoginCount -= 1;
  });
}

async function handleLogin(req: Request, ip: string, authenticated: boolean, payload: unknown): Promise<NextResponse> {
  const limited = await checkLoginRateLimit(ip, authenticated);
  if (limited) return throttledResponse(limited.retryAfterSeconds);

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

function throttledResponse(retryAfterSeconds: number) {
  return NextResponse.json({ error: "Too many login attempts, please try again later" }, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}
