export function draftConflictResponse(error: unknown): Response | null {
  if (!isRecord(error) || error.status !== 412 || !isRecord(error.current)) return null;
  const current = error.current;
  const etag = typeof current.etag === "string" ? current.etag : undefined;
  return Response.json({ error: "Draft changed since it was read", current }, {
    status: 412,
    headers: {
      ...(etag ? { ETag: etag } : {}),
      "Cache-Control": "no-store",
    },
  });
}

export function statusFromError(error: unknown): number {
  return isRecord(error) && typeof error.status === "number" ? error.status : 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
