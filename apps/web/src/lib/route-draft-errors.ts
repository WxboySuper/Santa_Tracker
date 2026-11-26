export function draftConflictResponse(error: unknown): Response | null {
  if (!isRecord(error)) return null;
  if (error.status !== 412) return null;
  if (!isRecord(error.current)) return null;
  const current = error.current;
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (typeof current.etag === "string") headers.set("ETag", current.etag);
  return Response.json({ error: "Draft changed since it was read", current }, {
    status: 412,
    headers,
  });
}

export function statusFromError(error: unknown): number {
  return isRecord(error) && typeof error.status === "number" ? error.status : 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object") return false;
  if (value === null) return false;
  return !Array.isArray(value);
}
