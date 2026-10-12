import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import { isValidUnlockTime } from "@/lib/advent";
import { previewAdminAdventDays } from "@/lib/admin-advent";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  if (!isAdventEnabled()) return jsonError("Not found", 404);
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return jsonError(auth.error ?? "Unauthorized", auth.status ?? 401);
  const rawTime = req.nextUrl.searchParams.get("at");
  if (rawTime === null) return jsonError("The 'at' query parameter is required", 400);
  const parsedTime = new Date(rawTime);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(rawTime) || !isValidUnlockTime(rawTime) || parsedTime.toISOString().slice(0, 19) !== rawTime.slice(0, 19)) {
    return jsonError("Invalid 'at'. Expected ISO 8601 UTC, e.g. 2026-12-05T00:00:00Z", 400);
  }
  try {
    const result = await previewAdminAdventDays(parsedTime);
    return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (error: unknown) {
    console.error("Admin advent preview error", error);
    return jsonError("Internal server error", 500);
  }
}

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}
