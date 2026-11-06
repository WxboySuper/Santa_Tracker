import type { ServerName } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object") return false;
  if (value === null) return false;
  if (Array.isArray(value)) return false;
  return true;
}

export function isServerEndpointMap(value: Record<string, string>): value is Record<ServerName, string> {
  if (!Object.hasOwn(value, "closed")) return false;
  return Object.hasOwn(value, "open");
}
