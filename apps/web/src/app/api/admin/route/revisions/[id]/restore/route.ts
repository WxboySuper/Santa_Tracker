import { requireAdminAuth } from "@/lib/auth";
import { draftConflictResponse, statusFromError } from "@/lib/route-draft-errors";
import { getRouteDraftService } from "@/lib/route-drafts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = await authFailure(request);
  if (denied) return denied;
  const ifMatch = request.headers.get("if-match");
  if (!ifMatch) return Response.json({ error: "If-Match is required" }, { status: 428 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Invalid revision ID" }, { status: 400 });
  }
  return restoreRevision(id, ifMatch);
}

async function authFailure(request: Request): Promise<Response | null> {
  const auth = await requireAdminAuth(request);
  return auth.ok ? null : Response.json({ error: auth.error }, { status: auth.status });
}

async function restoreRevision(id: string, ifMatch: string): Promise<Response> {
  try {
    const state = await getRouteDraftService().restoreRevision(id, ifMatch);
    return Response.json({ state, restored: true }, { headers: { ETag: state.etag, "Cache-Control": "no-store" } });
  } catch (error) {
    const conflict = draftConflictResponse(error);
    if (conflict) return conflict;
    const status = statusFromError(error);
    const message = status === 404 ? "Named revision not found" : status === 410 ? "Named revision content is unavailable" : "Unable to restore named revision";
    return Response.json({ error: message }, { status });
  }
}
