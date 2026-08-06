export interface ImportValidationResult {
  ok: boolean;
  /** Human-readable, safe reason suitable for a toast. */
  reason?: string;
}

/** Maximum accepted import file size (25 MB). */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
/** Maximum allowed object nesting depth. */
export const MAX_NESTING_DEPTH = 32;
/** Maximum number of items in any single array (protects against extreme collections). */
export const MAX_ARRAY_ITEMS = 100_000;
/** Maximum string length anywhere in the document. */
export const MAX_STRING_LENGTH = 100_000;

/** Returns a structured validation failure with an actionable message. */
export const fail = (reason: string): ImportValidationResult => ({ ok: false, reason });
