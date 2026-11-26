import { requireAdminAuth } from "@/lib/auth";
import { getRouteDraftService } from "@/lib/route-drafts";

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const state = await getRouteDraftService().getState();
    return Response.json(state, { headers: { ETag: state.etag, "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to load route draft" }, { status: 500 });
  }
}

export async function PUT(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const ifMatch = request.headers.get("if-match");
  if (!ifMatch) return Response.json({ error: "If-Match is required" }, { status: 428 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || !("data" in body)) {
    return Response.json({ error: "Request body must contain data" }, { status: 400 });
  }
  try {
    const state = await getRouteDraftService().save((body as { data: unknown }).data, ifMatch);
    return Response.json({ state, saved: true }, { headers: { ETag: state.etag, "Cache-Control": "no-store" } });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
    if (status === 412 && "current" in (error as object)) {
      const current = (error as { current: unknown }).current;
      return Response.json({ error: "Draft changed since it was read", saved: false, current }, { status, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: status === 412 ? "Draft changed since it was read" : "Unable to save route draft", saved: false }, { status });
  }
}
