import { requireAdminAuth } from "@/lib/auth";
import { draftConflictResponse, statusFromError } from "@/lib/route-draft-errors";
import { getRouteDraftService } from "@/lib/route-drafts";

export async function GET(request: Request): Promise<Response> {
  const denied = await authFailure(request);
  if (denied) return denied;
  const query = new URL(request.url).searchParams;
  const left = query.get("left");
  const right = query.get("right");
  if (hasIncompleteComparison(left, right)) return Response.json({ error: "Both left and right revision IDs are required" }, { status: 400 });
  return readRevisions(left, right);
}

function hasIncompleteComparison(left: string | null, right: string | null): boolean {
  if (left === null) return right !== null;
  return right === null;
}

async function readRevisions(left: string | null, right: string | null): Promise<Response> {
  try {
    const service = getRouteDraftService();
    if (left !== null && right !== null) {
      return Response.json(await service.compareRevisions(left, right), { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ revisions: await service.listRevisions() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = statusFromError(error);
    const message = status === 404 ? "Named revision not found" : status === 410 ? "Named revision content is unavailable" : "Unable to load route revisions";
    return Response.json({ error: message }, { status });
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await authFailure(request);
  if (denied) return denied;
  const ifMatch = request.headers.get("if-match");
  if (!ifMatch) return Response.json({ error: "If-Match is required" }, { status: 428 });
  const name = await readRevisionName(request);
  if (typeof name !== "string") return name;
  return createRevision(name, ifMatch);
}

async function authFailure(request: Request): Promise<Response | null> {
  const auth = await requireAdminAuth(request);
  return auth.ok ? null : Response.json({ error: auth.error }, { status: auth.status });
}

async function readRevisionName(request: Request): Promise<string | Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  const name = getName(body);
  if (!name) return Response.json({ error: "Revision name must contain 1 to 80 characters" }, { status: 400 });
  return name;
}

function getName(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  if (Array.isArray(body)) return null;
  if (!("name" in body)) return null;
  const name = body.name;
  if (typeof name !== "string") return null;
  if (!name.trim()) return null;
  if (name.trim().length > 80) return null;
  return name;
}

async function createRevision(name: string, ifMatch: string): Promise<Response> {
  try {
    const revision = await getRouteDraftService().createRevision(name, ifMatch);
    return Response.json({ revision }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const conflict = draftConflictResponse(error);
    if (conflict) return conflict;
    return revisionFailure(error);
  }
}

function revisionFailure(error: unknown): Response {
  const status = statusFromError(error);
  const message = status === 409 ? "Save a draft before creating a named revision" : "Unable to create named revision";
  return Response.json({ error: message }, { status });
}
