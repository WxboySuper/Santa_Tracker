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

export async function createAdminToken(): Promise<string> {
  const secret = getSecret();
  const session = await createAdminSession();
  const jwt = await new jose.SignJWT({ admin: true, csrf: session.csrfToken })
    .setProtectedHeader({ alg })
    .setJti(session.id)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_TTL_SECONDS}s`)
    .sign(secret);
  return jwt;
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  const secret = getSecret();
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    if (payload.admin !== true || typeof payload.jti !== "string") return false;
    return (await readActiveSession(payload.jti)) !== null;
  } catch {
    // Do NOT fallback to raw password comparison — security fix per audit
    // Previously Flask accepted raw ADMIN_PASSWORD as bearer token; we remove that.
    return false;
  }
}

export async function getAdminTokenCsrfToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());
    return typeof payload.csrf === "string" ? payload.csrf : null;
  } catch { return null; }
}

export async function getAdminTokenSessionId(token: string): Promise<string | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());
    return typeof payload.jti === "string" ? payload.jti : null;
  } catch { return null; }
}

export async function revokeAdminToken(token: string): Promise<void> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());
    if (typeof payload.jti === "string") await revokeAdminSession(payload.jti);
  } catch { /* invalid or expired tokens need no revocation record */ }
}

export function verifyAdminPassword(password: string): boolean {
  const adminPassword = getAdminPassword();
  if (!adminPassword) return false;
  // timing-safe compare
  const a = new TextEncoder().encode(password);
  const b = new TextEncoder().encode(adminPassword);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function requireAdminAuth(request: Request): Promise<{ ok: boolean; error?: string; status?: number }> {
  const credential = readAdminCredential(request);
  if (credential.invalid) return { ok: false, error: "Invalid credentials", status: 403 };
  if (!credential.token) {
    return { ok: false, error: "Authentication required", status: 401 };
  }
  const claims = await verifyAdminTokenClaims(credential.token);
  if (!claims) {
    return { ok: false, error: "Invalid credentials", status: 403 };
  }
  if (requiresCsrf(request, credential) && !hasValidCsrf(request, claims.csrf)) {
    await appendAuthAudit({ action: "csrf_rejected", result: "failure" });
    return { ok: false, error: "CSRF validation failed", status: 403 };
  }
  return { ok: true };
}

function requiresCsrf(request: Request, credential: { cookieAuth: boolean }): boolean {
  return credential.cookieAuth && isMutation(request.method);
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

async function verifyAdminTokenClaims(token: string): Promise<{ csrf: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());
    if (!hasAdminSessionClaims(payload)) return null;
    return await readActiveSession(payload.jti) ? { csrf: payload.csrf } : null;
  } catch { return null; }
}

function hasAdminSessionClaims(payload: jose.JWTPayload): payload is jose.JWTPayload & { admin: true; jti: string; csrf: string } {
  return payload.admin === true && typeof payload.jti === "string" && typeof payload.csrf === "string";
}

function isMutation(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function hasValidCsrf(request: Request, expected: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin !== expectedOrigin(request)) return false;
  const supplied = request.headers.get("x-csrf-token");
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)admin_csrf=([^;]*)/.exec(cookieHeader);
  if (!supplied || !match?.[1]) return false;
  try { return decodeURIComponent(match[1]) === supplied && supplied === expected; }
  catch { return false; }
}

function expectedOrigin(request: Request): string {
  const configured = process.env.ADMIN_WEBAUTHN_ORIGIN;
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

export function maskToken(token: string): string {
  if (!token) return "<empty>";
  if (token.length <= 8) return "*".repeat(token.length);
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
