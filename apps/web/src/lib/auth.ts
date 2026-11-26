import * as jose from "jose";
import { getSecretKey, getAdminPassword } from "./config";
import { appendAuthAudit, createAdminSession, readActiveSession, revokeAdminSession } from "./admin-auth-state";

// Use HS256 with SECRET_KEY — replaces Flask's URLSafeTimedSerializer
const alg = "HS256";
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

export function shouldUseSecureAdminCookie(): boolean {
  // Use a stable policy so logout can clear the cookie even if proxy headers differ.
  // HTTPS requests (including those marked by x-forwarded-proto) always require Secure.
  return true;
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(getSecretKey());
}

export async function createAdminToken(input: { authMethod?: "password" | "passkey" | "recovery" | "recovery_confirmed" } = {}): Promise<string> {
  const secret = getSecret();
  const session = await createAdminSession(Date.now(), ADMIN_SESSION_TTL_SECONDS, input.authMethod ?? "password");
  const jwt = await new jose.SignJWT({ admin: true, csrf: session.csrfToken })
    .setProtectedHeader({ alg })
    .setJti(session.id)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_TTL_SECONDS}s`)
    .sign(secret);
  return jwt;
}

export async function verifyAdminToken(input: { token: string }): Promise<boolean> {
  let payload: jose.JWTPayload;
  try {
    ({ payload } = await jose.jwtVerify(input.token, getSecret()));
  } catch {
    // Do NOT fallback to raw password comparison — security fix per audit
    // Previously Flask accepted raw ADMIN_PASSWORD as bearer token; we remove that.
    return false;
  }
  if (payload.admin !== true || typeof payload.jti !== "string") return false;
  return (await readActiveSession(payload.jti)) !== null;
}

export async function getAdminTokenCsrfToken(input: { token: string }): Promise<string | null> {
  try {
    const { payload } = await jose.jwtVerify(input.token, getSecret());
    return typeof payload.csrf === "string" ? payload.csrf : null;
  } catch { return null; }
}

export async function getAdminTokenSessionId(input: { token: string }): Promise<string | null> {
  try {
    const { payload } = await jose.jwtVerify(input.token, getSecret());
    return typeof payload.jti === "string" ? payload.jti : null;
  } catch { return null; }
}

export async function revokeAdminToken(input: { token: string }): Promise<void> {
  let payload: jose.JWTPayload;
  try {
    ({ payload } = await jose.jwtVerify(input.token, getSecret()));
  } catch { return; }
  if (typeof payload.jti === "string") await revokeAdminSession(payload.jti);
}

export function verifyAdminPassword(input: { password: string }): boolean {
  const adminPassword = getAdminPassword();
  if (!adminPassword) return false;
  // timing-safe compare
  const a = new TextEncoder().encode(input.password);
  const b = new TextEncoder().encode(adminPassword);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function requireAdminAuth(request: Request): Promise<{ ok: boolean; error?: string; status?: number; authMethod?: "password" | "passkey" | "recovery" | "recovery_confirmed" }> {
  const credential = readAdminCredential(request);
  if (credential.invalid) return { ok: false, error: "Invalid credentials", status: 403 };
  if (!credential.token) {
    return { ok: false, error: "Authentication required", status: 401 };
  }
  let claims: { csrf: string; authMethod: "password" | "passkey" | "recovery" | "recovery_confirmed" } | null;
  try { claims = await verifyAdminTokenClaims({ token: credential.token }); }
  catch { return { ok: false, error: "Admin authentication storage is unavailable", status: 503 }; }
  if (!claims) {
    return { ok: false, error: "Invalid credentials", status: 403 };
  }
  if (requiresCsrf(request, credential) && !hasValidCsrf({ request, expected: claims.csrf })) {
    await appendAuthAudit({ action: "csrf_rejected", result: "failure" });
    return { ok: false, error: "CSRF validation failed", status: 403 };
  }
  return { ok: true, authMethod: claims.authMethod };
}

export async function requirePasskeyManagementAuth(request: Request): Promise<{ ok: boolean; error?: string; status?: number; authMethod?: "password" | "passkey" | "recovery" | "recovery_confirmed" }> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return auth;
  if (auth.authMethod === "recovery") return { ok: false, error: "Use a second recovery code to authorize passkey management", status: 403 };
  return auth;
}

function requiresCsrf(request: Request, credential: { cookieAuth: boolean }): boolean {
  return credential.cookieAuth && isMutation({ method: request.method });
}

function readAdminCredential(request: Request): { token: string | null; cookieAuth: boolean; invalid: boolean } {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return { token: authorization.slice(7), cookieAuth: false, invalid: false };
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)admin_token=([^;]*)/.exec(cookieHeader);
  if (!match?.[1]) return { token: null, cookieAuth: true, invalid: false };
  try { return { token: decodeURIComponent(match[1]), cookieAuth: true, invalid: false }; }
  catch { return { token: null, cookieAuth: true, invalid: true }; }
}

async function verifyAdminTokenClaims(input: { token: string }): Promise<{ csrf: string; authMethod: "password" | "passkey" | "recovery" | "recovery_confirmed" } | null> {
  let payload: jose.JWTPayload;
  try {
    ({ payload } = await jose.jwtVerify(input.token, getSecret()));
  } catch { return null; }
  if (!hasAdminSessionClaims(payload)) return null;
  const session = await readActiveSession(payload.jti);
  return session ? { csrf: payload.csrf, authMethod: session.authMethod } : null;
}

function hasAdminSessionClaims(payload: jose.JWTPayload): payload is jose.JWTPayload & { admin: true; jti: string; csrf: string } {
  return payload.admin === true && typeof payload.jti === "string" && typeof payload.csrf === "string";
}

function isMutation(input: { method: string }): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(input.method.toUpperCase());
}

function hasValidCsrf(input: { request: Request; expected: string }): boolean {
  const { request, expected } = input;
  if (!hasExpectedOrigin(request)) return false;
  const supplied = request.headers.get("x-csrf-token");
  const cookieValue = csrfCookieValue(request);
  if (!supplied || !cookieValue) return false;
  try { return decodeURIComponent(cookieValue) === supplied && supplied === expected; }
  catch { return false; }
}

function hasExpectedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const allowedOrigin = expectedOrigin(request);
  return Boolean(origin && allowedOrigin && origin === allowedOrigin);
}

function csrfCookieValue(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  return /(?:^|;\s*)admin_csrf=([^;]*)/.exec(cookieHeader)?.[1] ?? null;
}

function expectedOrigin(request: Request): string | null {
  const configured = process.env.ADMIN_WEBAUTHN_ORIGIN;
  try { return configured ? new URL(configured).origin : new URL(request.url).origin; }
  catch { return null; }
}

export function maskToken(input: { token: string }): string {
  const { token } = input;
  if (!token) return "<empty>";
  if (token.length <= 8) return "*".repeat(token.length);
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
