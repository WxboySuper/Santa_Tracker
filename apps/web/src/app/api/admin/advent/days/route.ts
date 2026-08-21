import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import { loadAdventCalendar } from "@/lib/advent";
import { isUnlocked } from "@/lib/advent";

export async function GET(req: Request) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    const days = await loadAdventCalendar();
    const daysData = days.map(d => ({
      day: d.day,
      title: d.title,
      unlock_time: d.unlock_time,
      content_type: d.content_type,
      payload: d.payload,
      is_unlocked_override: d.is_unlocked_override ?? null,
      is_currently_unlocked: isUnlocked(d),
    }));
    return NextResponse.json({ days: daysData, total_days: days.length }, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Advent calendar data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
