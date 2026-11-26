import { NextResponse } from "next/server";
import { getAdminTokenSessionId, revokeAdminToken, shouldUseSecureAdminCookie } from "@/lib/auth";
import { appendAuthAudit } from "@/lib/admin-auth-state";
import { tokenFromRequest } from "@/lib/admin-passkey-http";

// Clears the HttpOnly admin_token cookie set by POST /api/admin/login.
export async function POST(request: Request) {
  const token = tokenFromRequest(request);
  if (token) {
    const sessionId = await getAdminTokenSessionId({ token });
    try {
      await revokeAdminToken({ token });
    } catch {
      return NextResponse.json({ error: "Admin authentication storage is unavailable; retry logout" }, { status: 503 });
    }
    if (sessionId) {
      try { await appendAuthAudit({ action: "logout", result: "success", sessionId }); }
      catch (error) { console.error("Admin logout succeeded but its audit event could not be stored", error); }
    }
  }
  return clearAuthCookies(NextResponse.json({ message: "Logged out" }, { status: 200 }));
}

function clearAuthCookies(response: NextResponse): NextResponse {
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
