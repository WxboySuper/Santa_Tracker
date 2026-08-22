import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as jose from "jose";
import { getSecretKey } from "./src/lib/config";

const PROTECTED_PREFIXES = ["/admin"];

async function verifyToken(token: string): Promise<boolean> {
  const secret = new TextEncoder().encode(getSecretKey());
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return payload.admin === true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public APIs that are gated by ADVENT_ENABLED should be handled in route handlers (return 404)
  // Protect admin pages (not APIs — APIs do Bearer verification themselves)
  const isAdminPage = PROTECTED_PREFIXES.some(p => pathname.startsWith(p)) && !pathname.startsWith("/api/");
  if (!isAdminPage) return NextResponse.next();

  // Allow the login page itself? We don't have separate login page; admin page handles client-side auth.
  // But to enforce server-owned boundary per audit (High finding), we check cookie.
  const token = req.cookies.get("admin_token")?.value ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const valid = await verifyToken(token);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
