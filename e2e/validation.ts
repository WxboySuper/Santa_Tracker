import type { ServerName } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object") return false;
  if (value === null) return false;
  if (Array.isArray(value)) return false;
  return true;
}

export function isHttpEndpointUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "http:") return true;
  return url.protocol === "https:";
}

export function isServerEndpointMap(value: unknown): value is Record<ServerName, string> {
  if (!isRecord(value)) return false;
  if (Object.keys(value).length !== 2) return false;
  if (!Object.hasOwn(value, "closed")) return false;
  if (!Object.hasOwn(value, "open")) return false;
  if (!isHttpEndpointUrl(value.closed)) return false;
  return isHttpEndpointUrl(value.open);
}
