import { requireAdminAuth } from "@/lib/auth";
import { getRouteDraftService } from "@/lib/route-drafts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const ifMatch = request.headers.get("if-match");
  if (!ifMatch) return Response.json({ error: "If-Match is required" }, { status: 428 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid revision ID" }, { status: 400 });
  try {
    const state = await getRouteDraftService().restoreRevision(id, ifMatch);
    return Response.json({ state, restored: true }, { headers: { ETag: state.etag, "Cache-Control": "no-store" } });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
    return Response.json({ error: status === 412 ? "Draft changed since it was read" : status === 404 ? "Named revision not found" : "Unable to restore named revision" }, { status });
  }
}
