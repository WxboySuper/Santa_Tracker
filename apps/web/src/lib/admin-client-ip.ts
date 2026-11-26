import { isIP } from "node:net";

const MAX_IP_LENGTH = 45;

export function getAdminClientIp(request: Request): string | null {
  const cloudflareIp = normalizeIp(request.headers.get("cf-connecting-ip"));
  if (cloudflareIp) return cloudflareIp;
  const realIp = normalizeIp(request.headers.get("x-real-ip"));
  if (realIp) return realIp;
  return process.env.NODE_ENV !== "production" ? "unknown" : null;
}

function normalizeIp(header: string | null): string | null {
  const value = header?.trim();
  if (!value || value.length > MAX_IP_LENGTH) return null;
  const version = isIP(value);
  if (version === 4) return value;
  if (version !== 6) return null;
  return new URL(`http://[${value}]/`).hostname.slice(1, -1);
}
