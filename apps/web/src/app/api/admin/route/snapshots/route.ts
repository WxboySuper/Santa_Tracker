import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { getSantaSnapshotsBucket } from "@/lib/cloudflare-bindings";
import { readSnapshotVersionId, validateSnapshotVersion } from "@/lib/route-snapshot-admin";
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
  const versionId = await readSnapshotVersionId(request);
  if (!versionId) return NextResponse.json({ error: "Expected a valid versionId" }, { status: 400, headers: NO_STORE });
  try {
    const store = getSnapshotStore(getSantaSnapshotsBucket());
    const result = await validateSnapshotVersion(store, versionId);
    if (result.kind === "missing") return NextResponse.json({ error: "Route snapshot not found" }, { status: 404, headers: NO_STORE });
    return NextResponse.json({ versionId, report: result.report }, { status: result.report.valid ? 200 : 422, headers: NO_STORE });
  } catch (error) {
    console.error("Admin route snapshot validation failed", error);
    return NextResponse.json({ error: "Unable to validate route snapshot" }, { status: 500, headers: NO_STORE });
  }
}

function makeEtag(updatedAt: string): string {
  return `"${updatedAt}"`;
}
