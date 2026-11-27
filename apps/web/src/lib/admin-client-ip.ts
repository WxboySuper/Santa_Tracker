import { isIP } from "node:net";

const MAX_IP_LENGTH = 45;
export const ADMIN_CLIENT_IP_UNAVAILABLE = "Admin authentication is unavailable: trusted Cloudflare client IP is missing";

export function getAdminClientIp(request: Request, isProduction = process.env.NODE_ENV === "production"): string | null {
  const cloudflareIp = normalizeIp(request.headers.get("cf-connecting-ip"));
  if (cloudflareIp) return cloudflareIp;
  if (!isProduction) return normalizeIp(request.headers.get("x-real-ip")) ?? "unknown";
  return null;
}

function normalizeIp(header: string | null): string | null {
  const value = header?.trim();
  if (!value || value.length > MAX_IP_LENGTH) return null;
  const version = isIP(value);
  if (version === 4) return value;
  if (version !== 6) return null;
  return new URL(`http://[${value}]/`).hostname.slice(1, -1);
}
