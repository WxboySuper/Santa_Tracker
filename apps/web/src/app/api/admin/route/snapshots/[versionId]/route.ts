import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { getSantaSnapshotsBucket } from "@/lib/cloudflare-bindings";
import { activationResponse, activateSnapshot, isSafeVersionId, readSnapshotReason } from "@/lib/route-snapshot-admin";
import { getSnapshotStore } from "@/lib/storage";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ versionId: string }> }) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  const versionId = (await context.params).versionId;
  if (!isSafeVersionId(versionId)) return NextResponse.json({ error: "Expected a valid versionId" }, { status: 400, headers: NO_STORE });
  const expectedUpdatedAt = parseEtag(request.headers.get("if-match"));
  if (expectedUpdatedAt === null) return NextResponse.json({ error: "If-Match is required. Read the active route snapshot before activation." }, { status: 428, headers: NO_STORE });
  const reason = await readSnapshotReason(request);
  if (reason === null) return NextResponse.json({ error: "A non-empty reason of at most 500 characters is required" }, { status: 400, headers: NO_STORE });
  try {
    const store = getSnapshotStore(getSantaSnapshotsBucket());
    const result = await activateSnapshot(store, versionId, expectedUpdatedAt, reason);
    return activationResponse(result);
  } catch (error) {
    console.error("Admin route snapshot activation failed", error);
    return NextResponse.json({ error: "Unable to activate route snapshot" }, { status: 500, headers: NO_STORE });
  }
}

function parseEtag(value: string | null): string | null {
  const match = value && /^"([^"]*)"$/.exec(value);
  return match ? match[1] ?? null : null;
}

