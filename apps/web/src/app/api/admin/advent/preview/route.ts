import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import { isValidUnlockTime } from "@/lib/advent";
import { previewAdminAdventDays } from "@/lib/admin-advent";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 });
  const rawTime = req.nextUrl.searchParams.get("at");
  if (!rawTime) return NextResponse.json({ error: "The 'at' query parameter is required" }, { status: 400, headers: NO_STORE });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(rawTime) || !isValidUnlockTime(rawTime)) {
    return NextResponse.json({ error: "Invalid 'at'. Expected ISO 8601 UTC, e.g. 2026-12-05T00:00:00Z" }, { status: 400, headers: NO_STORE });
  }
  const previewTime = new Date(rawTime);
  const result = await previewAdminAdventDays(previewTime);
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
}
