import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import { loadAdventCalendar, validateAdventCalendar } from "@/lib/advent";

export async function POST(req: Request) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    const days = await loadAdventCalendar();
    const result = validateAdventCalendar(days);
    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Advent calendar data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
