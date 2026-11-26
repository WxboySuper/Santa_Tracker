import { requireAdminAuth } from "@/lib/auth";
import { readCappedJson } from "@/lib/admin-json";
import { draftConflictResponse, statusFromError } from "@/lib/route-draft-errors";
import { getRouteDraftService } from "@/lib/route-drafts";

export const dynamic = "force-dynamic";
const MAX_ROUTE_DRAFT_BYTES = 5_000_000;

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
  const input = await readCappedJson(request, MAX_ROUTE_DRAFT_BYTES);
  if (!input.ok) return Response.json({ error: input.error }, { status: input.status });
  if (!isDraftInput(input.value)) return Response.json({ error: "Request body must contain data" }, { status: 400 });
  return saveDraft(input.value.data, ifMatch);
}

async function authFailure(request: Request): Promise<Response | null> {
  const auth = await requireAdminAuth(request);
  return auth.ok ? null : Response.json({ error: auth.error }, { status: auth.status });
}

function isDraftInput(body: unknown): body is { data: unknown } {
  if (typeof body !== "object") return false;
  if (body === null) return false;
  if (Array.isArray(body)) return false;
  return "data" in body;
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
