import { requireAdminAuth } from "@/lib/auth";
import { getRouteDraftService } from "@/lib/route-drafts";

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const query = new URL(request.url).searchParams;
  const left = query.get("left");
  const right = query.get("right");
  try {
    const service = getRouteDraftService();
    if (left || right) {
      if (!left || !right) return Response.json({ error: "Both left and right revision IDs are required" }, { status: 400 });
      return Response.json(await service.compareRevisions(left, right), { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ revisions: await service.listRevisions() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
    return Response.json({ error: status === 404 ? "Named revision not found" : "Unable to load route revisions" }, { status });
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const ifMatch = request.headers.get("if-match");
  if (!ifMatch) return Response.json({ error: "If-Match is required" }, { status: 428 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  const name = body && typeof body === "object" && "name" in body ? (body as { name?: unknown }).name : null;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
    return Response.json({ error: "Revision name must contain 1 to 80 characters" }, { status: 400 });
  }
  try {
    const revision = await getRouteDraftService().createRevision(name, ifMatch);
    return Response.json({ revision }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
    return Response.json({ error: status === 412 ? "Draft changed since it was read" : status === 409 ? "Save a draft before creating a named revision" : "Unable to create named revision" }, { status });
  }
}
