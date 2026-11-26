import { NextResponse } from "next/server";
import { ADMIN_CLIENT_IP_UNAVAILABLE, getAdminClientIp } from "@/lib/admin-client-ip";
import { checkLoginRateLimit, checkLoginRateLimitNow, clearLoginAttempts, loginAdmin, recordLoginAttempt, wasLoginAttemptRecorded } from "@/lib/admin-login";
import { respondWith } from "@/lib/admin-api";
import { ADMIN_SESSION_TTL_SECONDS, getAdminTokenCsrfToken, revokeAdminToken, shouldUseSecureAdminCookie } from "@/lib/auth";
import { appendAuthAudit } from "@/lib/admin-auth-state";

const MAX_LOGIN_BODY_BYTES = 4096;
export function getClientIp(req: Request): string | null {
  return getAdminClientIp(req);
}

export async function POST(req: Request) {
  try { return await processLoginRequest(req); }
  catch (error) {
    console.error("Admin login request failed", error);
    return storageUnavailable();
  }
}

async function processLoginRequest(req: Request) {
  const ip = getClientIp(req);
  if (!ip) return NextResponse.json({ error: ADMIN_CLIENT_IP_UNAVAILABLE }, { status: 503 });
  const lockout = await checkLoginRateLimit(ip);
  if (lockout) return throttledResponse({ retryAfterSeconds: lockout.retryAfterSeconds });
  return processLogin({ request: req, ip });
}

function storageUnavailable() {
  return NextResponse.json({ error: "Admin authentication storage is unavailable" }, { status: 503 });
}

async function processLogin(input: { request: Request; ip: string }) {
  const { request, ip } = input;
  const payload = await readCappedJsonBody(request);
  if (payload.kind === "too-large") return handleOversizedLogin({ ip });
  if (payload.kind === "invalid") return handleMalformedLogin({ ip });
  return verifyLogin({ request, ip, payload: payload.value });
}

async function handleOversizedLogin({ ip }: { ip: string }) {
  const result = await countInvalidLogin({ ip });
  if (result.status === 429) return throttledResponse({ retryAfterSeconds: await getRetryAfter({ ip }) });
  return NextResponse.json({ error: "Request body too large" }, { status: 413 });
}

async function handleMalformedLogin({ ip }: { ip: string }) {
  const result = await countInvalidLogin({ ip });
  if (result.status === 429) return throttledResponse({ retryAfterSeconds: await getRetryAfter({ ip }) });
  return respondWith(result);
}

async function countInvalidLogin({ ip }: { ip: string }) {
  return loginAdmin(null, ip);
}

async function getRetryAfter({ ip }: { ip: string }): Promise<number> {
  return (await checkLoginRateLimit(ip))?.retryAfterSeconds ?? 900;
}

async function verifyLogin(input: { request: Request; ip: string; payload: unknown }) {
  const { request, ip, payload } = input;
  const lockout = checkLoginRateLimitNow(ip);
  if (lockout) return throttledResponse({ retryAfterSeconds: lockout.retryAfterSeconds });
  if (lockout === undefined) {
    const asyncLockout = await checkLoginRateLimit(ip);
    if (asyncLockout) return throttledResponse({ retryAfterSeconds: asyncLockout.retryAfterSeconds });
  }
  const login = loginAdmin(payload, ip);
  if (login instanceof Promise) return completeAsyncLogin({ request, login, ip });
  const result = login;
  const failure = await failedLoginLimit({ ip, result });
  if (failure) return throttledResponse({ retryAfterSeconds: failure.retryAfterSeconds });
  return setLoginCookie({ request, result, ip });
}

type LoginResult = Awaited<ReturnType<typeof loginAdmin>>;

async function completeAsyncLogin(input: { request: Request; login: Promise<LoginResult>; ip: string }) {
  const { request, login, ip } = input;
  const result = await login;
  const rejection = await asyncLoginRejection({ result, ip });
  if (rejection) return rejection;
  return setLoginCookie({ request, result, ip });
}

async function asyncLoginRejection(input: { result: LoginResult; ip: string }): Promise<Response | null> {
  const { result, ip } = input;
  const failure = await failedLoginLimit({ ip, result });
  if (failure) return throttledResponse({ retryAfterSeconds: failure.retryAfterSeconds });
  if (result.status !== 200) return null;
  const lockout = await checkLoginRateLimit(ip);
  if (lockout) return throttledLoginResponse({ result, retryAfterSeconds: lockout.retryAfterSeconds });
  const syncLockout = checkLoginRateLimitNow(ip);
  if (syncLockout) return throttledLoginResponse({ result, retryAfterSeconds: syncLockout.retryAfterSeconds });
  return null;
}

async function throttledLoginResponse(input: { result: LoginResult; retryAfterSeconds: number }): Promise<Response> {
  const revokeFailure = await revokeThrottledLogin(input.result);
  return revokeFailure ?? throttledResponse({ retryAfterSeconds: input.retryAfterSeconds });
}

async function revokeThrottledLogin(result: Awaited<ReturnType<typeof loginAdmin>>): Promise<Response | null> {
  try {
    await revokeResultToken(result);
    return null;
  } catch (error) {
    console.error("Failed to revoke admin session after throttled login", error);
    return storageUnavailable();
  }
}

async function failedLoginLimit({ ip, result }: { ip: string; result: LoginResult }) {
  if (result.status !== 401 || wasLoginAttemptRecorded(result)) return null;
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

async function setLoginCookie(input: { request: Request; result: LoginResult; ip: string }) {
  const { request, result, ip } = input;
  if (result.status === 429) {
    const lockout = await checkLoginRateLimit(ip);
    return throttledResponse({ retryAfterSeconds: lockout?.retryAfterSeconds ?? 900 });
  }
  if (result.status !== 200) return respondWith(result);
  await clearLoginAttempts(ip);
  try { await appendAuthAudit({ action: "password_login", result: "success" }); }
  catch {
    try { await revokeResultToken(result); } catch { /* the 503 response still clears no credentials to the caller */ }
    return storageUnavailable();
  }
  const response = respondWith(result);
  const token = result.body.token;
  if (typeof token !== "string") return response;
  response.cookies.set("admin_token", token, {
    httpOnly: true,
    secure: shouldUseSecureAdminCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
  const csrfToken = await getAdminTokenCsrfToken({ token });
  if (csrfToken) response.cookies.set("admin_csrf", csrfToken, {
    httpOnly: false,
    secure: shouldUseSecureAdminCookie(),
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
  return response;
}

async function throttledResponse({ retryAfterSeconds }: { retryAfterSeconds: number }) {
  try { await appendAuthAudit({ action: "password_login_throttled", result: "failure" }); } catch { /* preserve the rate-limit response during audit storage failures */ }
  return NextResponse.json({ error: "Too many login attempts, please try again later" }, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}

async function revokeResultToken(result: LoginResult) {
  if (result.status !== 200 || typeof result.body.token !== "string") return;
  await revokeAdminToken({ token: result.body.token });
}
