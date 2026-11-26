import { requireAdminAuth } from "@/lib/auth";
import { draftConflictResponse, statusFromError } from "@/lib/route-draft-errors";
import { getRouteDraftService } from "@/lib/route-drafts";

export async function GET(request: Request): Promise<Response> {
  const denied = await authFailure(request);
  if (denied) return denied;
  try {
    const state = await getRouteDraftService().getState();
    return Response.json(state, { headers: { ETag: state.etag, "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to load route draft" }, { status: 500 });
  }
}

export async function PUT(request: Request): Promise<Response> {
  const denied = await authFailure(request);
  if (denied) return denied;
  const ifMatch = request.headers.get("if-match");
  if (!ifMatch) return Response.json({ error: "If-Match is required" }, { status: 428 });
  const input = await readDraftInput(request);
  if (input.error) return Response.json({ error: input.error }, { status: 400 });
  return saveDraft(input.data, ifMatch);
}

async function authFailure(request: Request): Promise<Response | null> {
  const auth = await requireAdminAuth(request);
  return auth.ok ? null : Response.json({ error: auth.error }, { status: auth.status });
}

async function readDraftInput(request: Request): Promise<{ data: unknown; error?: never } | { data?: never; error: string }> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return { error: "Request body must be valid JSON" }; }
  if (!isDraftInput(body)) return { error: "Request body must contain data" };
  return { data: body.data };
}

function isDraftInput(body: unknown): body is { data: unknown } {
  return typeof body === "object" && body !== null && !Array.isArray(body) && "data" in body;
}

async function saveDraft(data: unknown, ifMatch: string): Promise<Response> {
  try {
    const state = await getRouteDraftService().save(data, ifMatch);
    return Response.json({ state, saved: true }, { headers: { ETag: state.etag, "Cache-Control": "no-store" } });
  } catch (error) {
    return saveFailure(error);
  }
}

function saveFailure(error: unknown): Response {
  const conflict = draftConflictResponse(error);
  if (conflict) return conflict;
  const status = statusFromError(error);
  const message = status === 412 ? "Draft changed since it was read" : "Unable to save route draft";
  return Response.json({ error: message, saved: false }, { status });
}
