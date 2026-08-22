import * as jose from "jose";
import { getSecretKey, getAdminPassword } from "./config";

// Use HS256 with SECRET_KEY — replaces Flask's URLSafeTimedSerializer
const alg = "HS256";
const TOKEN_EXPIRY = "24h";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(getSecretKey());
}

export async function createAdminToken(): Promise<string> {
  const secret = getSecret();
  const jwt = await new jose.SignJWT({ admin: true })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(secret);
  return jwt;
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  const secret = getSecret();
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return payload.admin === true;
  } catch {
    // Do NOT fallback to raw password comparison — security fix per audit
    // Previously Flask accepted raw ADMIN_PASSWORD as bearer token; we remove that.
    return false;
  }
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const adminPassword = getAdminPassword();
  if (!adminPassword) return false;
  // timing-safe compare
  const a = new TextEncoder().encode(password);
  const b = new TextEncoder().encode(adminPassword);
  if (a.length !== b.length) return false;
  // constant time
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function requireAdminAuth(request: Request): Promise<{ ok: boolean; error?: string; status?: number }> {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return { ok: false, error: "Authentication required", status: 401 };
  }
  const token = auth.slice(7);
  if (!token) return { ok: false, error: "Authentication required", status: 401 };
  const valid = await verifyAdminToken(token);
  if (!valid) {
    return { ok: false, error: "Invalid credentials", status: 403 };
  }
  return { ok: true };
}

export function maskToken(token: string): string {
  if (!token) return "<empty>";
  if (token.length <= 8) return "*".repeat(token.length);
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
