import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as jose from "jose";
import { getSecretKey } from "./src/lib/config";

async function verifyToken(token: string): Promise<boolean> {
  const secret = new TextEncoder().encode(getSecretKey());
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return payload.admin === true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public APIs that are gated by ADVENT_ENABLED should be handled in route handlers (return 404)
  // Protect admin pages only. APIs do Bearer/cookie verification themselves via requireAdminAuth
  // so we avoid double coverage and inconsistent error shapes.
  const isAdminPage = pathname.startsWith("/admin/");
  if (!isAdminPage) return NextResponse.next();

  const token = req.cookies.get("admin_token")?.value ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return handleAuthFailure(req, "Authentication required", 401);
  }
  const valid = await verifyToken(token);
  if (!valid) {
    return handleAuthFailure(req, "Invalid credentials", 403);
  }
  return NextResponse.next();
}

function handleAuthFailure(req: NextRequest, message: string, status: 401 | 403) {
  const accept = req.headers.get("accept") ?? "";
  const isPageNavigation = accept.includes("text/html");
  if (isPageNavigation) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.json({ error: message }, { status });
}

export const config = {
  matcher: ["/admin/:path*"],
};
