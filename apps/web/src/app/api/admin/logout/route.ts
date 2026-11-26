import { NextResponse } from "next/server";
import { getAdminTokenSessionId, requireAdminAuth, revokeAdminToken, shouldUseSecureAdminCookie, verifyAdminToken } from "@/lib/auth";
import { appendAuthAudit } from "@/lib/admin-auth-state";

// Clears the HttpOnly admin_token cookie set by POST /api/admin/login.
export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)admin_token=([^;]*)/.exec(cookieHeader);
  if (match?.[1]) {
    try {
      const token = decodeURIComponent(match[1]);
      if (await verifyAdminToken(token)) {
        const auth = await requireAdminAuth(request);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
      const sessionId = await getAdminTokenSessionId(token);
      await revokeAdminToken(token);
      if (sessionId) await appendAuthAudit({ action: "logout", result: "success", sessionId });
    } catch { /* clear cookies even when a token is malformed */ }
  }
  const response = NextResponse.json({ message: "Logged out" }, { status: 200 });
  response.cookies.set("admin_token", "", {
    httpOnly: true,
    secure: shouldUseSecureAdminCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set("admin_csrf", "", {
    httpOnly: false,
    secure: shouldUseSecureAdminCookie(),
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
