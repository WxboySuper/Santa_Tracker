import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { getSantaSnapshotsBucket } from "@/lib/cloudflare-bindings";
import { validateRouteSnapshot } from "@/lib/route-snapshot-release";
import { getSnapshotStore } from "@/lib/storage";
import { DATASET_SANTA_ROUTE } from "@/lib/storage/types";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  try {
    const store = getSnapshotStore(getSantaSnapshotsBucket());
    const [active, versions] = await Promise.all([
      store.readActiveVersion(DATASET_SANTA_ROUTE),
      store.listVersions(DATASET_SANTA_ROUTE),
    ]);
    return NextResponse.json({ active, versions }, {
      headers: { ...NO_STORE, ETag: active ? makeEtag(active.updatedAt) : '""' },
    });
  } catch (error) {
    console.error("Admin route snapshots read failed", error);
    return NextResponse.json({ error: "Unable to read route snapshots" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  const parsed = await readJson(request);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value)) {
    return NextResponse.json({ error: "Expected a JSON object with versionId" }, { status: 400, headers: NO_STORE });
  }
  const versionId = (parsed.value as Record<string, unknown>).versionId;
  if (typeof versionId !== "string" || !versionId || versionId.includes("/")) {
    return NextResponse.json({ error: "Expected a valid versionId" }, { status: 400, headers: NO_STORE });
  }
  try {
    const store = getSnapshotStore(getSantaSnapshotsBucket());
    const body = await store.readVersion(DATASET_SANTA_ROUTE, versionId);
    if (body === null) return NextResponse.json({ error: "Route snapshot not found" }, { status: 404, headers: NO_STORE });
    const report = await validateRouteSnapshot(body);
    return NextResponse.json({ versionId, report }, { status: report.valid ? 200 : 422, headers: NO_STORE });
  } catch (error) {
    console.error("Admin route snapshot validation failed", error);
    return NextResponse.json({ error: "Unable to validate route snapshot" }, { status: 500, headers: NO_STORE });
  }
}

async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return { ok: false };
  try { return { ok: true, value: await request.json() as unknown }; } catch { return { ok: false }; }
}

function makeEtag(updatedAt: string): string {
  return `"${updatedAt}"`;
}
