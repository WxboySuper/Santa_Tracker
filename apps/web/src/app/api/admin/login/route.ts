import { checkLoginRateLimit, clearLoginAttempts, loginAdmin, recordLoginAttempt } from "@/lib/admin-login";
import { readJsonBody, respondWith } from "@/lib/admin-api";

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Security review: Admin token issuance for 22 protected endpoints.
// Exposure declared 2026-08-26 — HS256 JWT (24h, ADMIN_PASSWORD-gated,
// server-owned auth boundary via requireAdminAuth + middleware). See
// docs/ADMIN_DASHBOARD.md and docs/ADMIN_SECURITY_REVIEW.md. Rate
// limited here; additional edge/WAF throttling recommended for production.
export async function POST(req: Request) {
  const ip = clientIp(req);
  const limited = checkLoginRateLimit(ip);
  if (limited) return respondWith(limited);

  const result = await loginAdmin(await readJsonBody(req));

  if (result.status === 401) recordLoginAttempt(ip);
  else if (result.status === 200) clearLoginAttempts(ip);

  const response = respondWith(result);
  if (result.status === 200 && typeof result.body.token === "string") {
    response.cookies.set("admin_token", result.body.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }
  return response;
}
