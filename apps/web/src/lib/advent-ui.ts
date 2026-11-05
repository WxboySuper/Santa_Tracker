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
// A backslash (written "\\"), a colon (scheme), a query marker and a fragment marker.
const FORBIDDEN_CHARS = ["\\", ":", "?", "#"];

/** Control characters, whitespace (including Unicode spaces) and the characters that let a path escape. */
function hasUnsafeCharacter(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f || /\s/.test(ch) || FORBIDDEN_CHARS.includes(ch)) return true;
  }
  return false;
}

/**
 * Validate the URL of an embedded activity. The value comes from editable calendar data, so it must
 * never become an open redirect or a script URL: only a same-origin path under /advent/ is allowed.
 * No scheme, protocol-relative form, backslash, traversal, query or fragment. Returns the path when
 * safe, otherwise null (the day then shows its fallback).
 */
export function safeEmbedPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith(EMBED_PREFIX) || value.length > 200) return null;
  if (hasUnsafeCharacter(value) || value.includes("//") || value.includes("..")) return null;
  return value;
}
