import { NextResponse } from "next/server";
import { checkLoginRateLimit, clearLoginAttempts, loginAdmin, recordLoginAttempt } from "@/lib/admin-login";
import { readJsonBody, respondWith } from "@/lib/admin-api";
import { ADMIN_SESSION_TTL_SECONDS, requireAdminAuth } from "@/lib/auth";

export function getClientIp(req: Request): string {
  const cloudflareIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const existingSession = await requireAdminAuth(req);
  const limited = await checkLoginRateLimit(ip, existingSession.ok);
  if (limited) return throttledResponse(limited.retryAfterSeconds);

  const result = await loginAdmin(await readJsonBody(req));
  if (result.status === 401) {
    const failureLimit = await recordLoginAttempt(ip);
    if (failureLimit) return throttledResponse(failureLimit.retryAfterSeconds);
  } else if (result.status === 200) {
    await clearLoginAttempts(ip);
  }

  const response = respondWith(result);
  if (result.status !== 200) return response;
  const token = result.body.token;
  if (typeof token !== "string") return response;
  response.cookies.set("admin_token", token, {
    httpOnly: true,
    secure: new URL(req.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
  return response;
}

function throttledResponse(retryAfterSeconds: number) {
  return NextResponse.json({ error: "Too many login attempts, please try again later" }, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}
