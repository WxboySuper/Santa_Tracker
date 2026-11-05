import { NextResponse } from "next/server";
import { shouldUseSecureAdminCookie } from "@/lib/auth";

// Clears the HttpOnly admin_token cookie set by POST /api/admin/login.
export function POST(request: Request) {
  const response = NextResponse.json({ message: "Logged out" }, { status: 200 });
  response.cookies.set("admin_token", "", {
    httpOnly: true,
    secure: shouldUseSecureAdminCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
