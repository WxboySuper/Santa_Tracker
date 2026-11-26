import { NextResponse } from "next/server";
import { ADMIN_SESSION_TTL_SECONDS, getAdminTokenCsrfToken, shouldUseSecureAdminCookie } from "./auth";

const CHALLENGE_COOKIE = "admin_passkey_challenge";

export function tokenFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  const match = /(?:^|;\s*)admin_token=([^;]*)/.exec(request.headers.get("cookie") ?? "");
  if (!match?.[1]) return null;
  try { return decodeURIComponent(match[1]); }
  catch { return null; }
}

export function challengeIdFromRequest(request: Request): string | null {
  const match = /(?:^|;\s*)admin_passkey_challenge=([^;]*)/.exec(request.headers.get("cookie") ?? "");
  if (!match?.[1]) return null;
  try { return decodeURIComponent(match[1]); }
  catch { return null; }
}

export function setChallengeCookie(response: NextResponse, challengeId: string): NextResponse {
  response.cookies.set(CHALLENGE_COOKIE, challengeId, challengeCookieOptions(5 * 60));
  return response;
}

export function clearChallengeCookie(response: NextResponse): NextResponse {
  response.cookies.set(CHALLENGE_COOKIE, "", challengeCookieOptions(0));
  return response;
}

function challengeCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: shouldUseSecureAdminCookie(),
    sameSite: "strict",
    path: "/api/admin/passkeys",
    maxAge,
  } as const;
}

export async function responseWithSession(token: string, body: Record<string, unknown>): Promise<NextResponse> {
  const response = NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set("admin_token", token, {
    httpOnly: true,
    secure: shouldUseSecureAdminCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
  const csrf = await getAdminTokenCsrfToken({ token });
  if (csrf) response.cookies.set("admin_csrf", csrf, {
    httpOnly: false,
    secure: shouldUseSecureAdminCookie(),
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
  return response;
}

export function authError(error: string | undefined, status: number | undefined): Response {
  return NextResponse.json({ error: error ?? "Authentication required" }, { status: status ?? 401 });
}

export function tooManyAttempts(retryAfterSeconds: number): Response {
  return NextResponse.json({ error: "Too many authentication attempts" }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
}
