import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import { isValidUnlockTime } from "@/lib/advent";
import { previewAdminAdventDays } from "@/lib/admin-advent";
import { badRequest, respondWith } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 });
  const rawTime = req.nextUrl.searchParams.get("at");
  if (!rawTime) return respondWith(badRequest("The 'at' query parameter is required"));
  if (!isValidUnlockTime(rawTime)) return respondWith(badRequest("Invalid 'at'. Expected ISO 8601 UTC, e.g. 2026-12-05T00:00:00Z"));
  const previewTime = new Date(rawTime);
  const result = await previewAdminAdventDays(previewTime);
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
}
