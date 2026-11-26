import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { getSantaSnapshotsBucket } from "@/lib/cloudflare-bindings";
import { withWriteLock } from "@/lib/file-lock";
import { validateRouteSnapshot } from "@/lib/route-snapshot-release";
import { getSnapshotStore } from "@/lib/storage";
import { DATASET_SANTA_ROUTE } from "@/lib/storage/types";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  const expectedUpdatedAt = parseEtag(request.headers.get("if-match"));
  if (expectedUpdatedAt === null) return NextResponse.json({ error: "If-Match is required. Read the active route snapshot before rollback." }, { status: 428, headers: NO_STORE });
  const reason = await readReason(request);
  if (reason === null) return NextResponse.json({ error: "A non-empty reason of at most 500 characters is required" }, { status: 400, headers: NO_STORE });
  try {
    const store = getSnapshotStore(getSantaSnapshotsBucket());
    const result = await withWriteLock(async () => {
      const active = await store.readActiveVersion(DATASET_SANTA_ROUTE);
      if ((active?.updatedAt ?? "") !== expectedUpdatedAt) return { kind: "conflict" as const };
      const versions = await store.listVersions(DATASET_SANTA_ROUTE);
      const currentIndex = versions.findIndex(version => version.versionId === active?.versionId);
      const prior = versions[currentIndex + 1];
      if (!prior) return { kind: "no-prior" as const };
      const body = await store.readVersion(DATASET_SANTA_ROUTE, prior.versionId);
      if (body === null) return { kind: "missing" as const };
      const report = await validateRouteSnapshot(body);
      if (!report.valid) return { kind: "invalid" as const, report };
      const rolled = await store.rollback(DATASET_SANTA_ROUTE, {
        actor: "admin",
        reason,
        checksum: report.checksum,
      });
      return { kind: "rolled-back" as const, rolled, report, active: await store.readActiveVersion(DATASET_SANTA_ROUTE) };
    });
    if (result.kind === "conflict") return NextResponse.json({ error: "Active route changed. Reload snapshots before retrying." }, { status: 412, headers: NO_STORE });
    if (result.kind === "no-prior") return NextResponse.json({ error: "No prior route snapshot is available" }, { status: 409, headers: NO_STORE });
    if (result.kind === "missing") return NextResponse.json({ error: "Prior route snapshot not found" }, { status: 404, headers: NO_STORE });
    if (result.kind === "invalid") return NextResponse.json({ error: "Prior route snapshot failed validation", report: result.report }, { status: 422, headers: NO_STORE });
    return NextResponse.json({ snapshot: result.rolled, active: result.active, report: result.report }, {
      headers: { ...NO_STORE, ETag: `"${result.active?.updatedAt ?? ""}"` },
    });
  } catch (error) {
    console.error("Admin route snapshot rollback failed", error);
    return NextResponse.json({ error: "Unable to roll back route snapshot" }, { status: 500, headers: NO_STORE });
  }
}

async function readReason(request: Request): Promise<string | null> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
    const reason = (body as Record<string, unknown>).reason;
    return typeof reason === "string" && reason.trim().length > 0 && reason.length <= 500 ? reason.trim() : null;
  } catch { return null; }
}

function parseEtag(value: string | null): string | null {
  const match = value && /^"([^"]*)"$/.exec(value);
  return match ? match[1] ?? null : null;
}
