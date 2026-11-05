/** Pure presentation helpers for the Advent calendar. No I/O, no clock. */

/**
 * Format an unlock timestamp as a short calendar date such as "Dec 5".
 * Always rendered in UTC so server and browser agree and the label never shifts by timezone
 * (unlock times are stored as UTC instants).
 */
export function formatUnlockDate(unlockIso: string, locale: string): string {
  const date = new Date(unlockIso);
  if (Number.isNaN(date.getTime())) return unlockIso;
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  } catch {
    // An unsupported locale tag must not break the page; fall back to English.
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  }
}

const EMBED_PREFIX = "/advent/";
// A backslash (written "\\"), a colon (scheme), a query marker, a fragment marker, and "%": browsers
// normalise %2e%2e as ".." so an encoded path can climb out of /advent/. Our paths are plain
// kebab-case, so percent-encoding is never legitimate here.
const FORBIDDEN_CHARS = ["\\", ":", "?", "#", "%"];

const MAX_EMBED_PATH_LENGTH = 200;

/** ASCII control characters, the space, and DEL. */
function isControlCode(code: number): boolean {
  return code <= 0x20 || code === 0x7f;
}

/** Unicode whitespace, or one of the characters that let a path escape its directory. */
function isForbiddenCharacter(ch: string): boolean {
  return /\s/.test(ch) || FORBIDDEN_CHARS.includes(ch);
}

function hasUnsafeCharacter(value: string): boolean {
  for (const ch of value) {
    if (isControlCode(ch.codePointAt(0) ?? 0)) return true;
    if (isForbiddenCharacter(ch)) return true;
  }
  return false;
}

/** Doubled slashes (protocol-relative) or `..` segments (traversal). */
function hasPathEscape(value: string): boolean {
  return value.includes("//") || value.includes("..");
}

function isAllowedShape(value: string): boolean {
  return value.startsWith(EMBED_PREFIX) && value.length <= MAX_EMBED_PATH_LENGTH;
}

/**
 * Validate the URL of an embedded activity. The value comes from editable calendar data, so it must
 * never become an open redirect or a script URL: only a same-origin path under /advent/ is allowed.
 * No scheme, protocol-relative form, backslash, traversal, query or fragment. Returns the path when
 * safe, otherwise null (the day then shows its fallback).
 */
export function safeEmbedPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!isAllowedShape(value)) return null;
  if (hasUnsafeCharacter(value)) return null;
  if (hasPathEscape(value)) return null;
  return value;
}
