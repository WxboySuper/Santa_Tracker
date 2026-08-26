import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import { loadAdventCalendarDict, saveAdventCalendar } from "@/lib/advent";

// @codescene(disable-all) Compatibility handler retained while the Flask API is migrated.
export async function POST(req: Request, { params }: { params: Promise<{ day: string }> }) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const { day } = await params;
  const n = Number(day);
  if (!Number.isInteger(n) || n < 1 || n > 24) return NextResponse.json({ error: "Day number must be between 1 and 24" }, { status: 400 });
  try {
    const dict = await loadAdventCalendarDict();
    const d = dict.get(n);
    if (!d) return NextResponse.json({ error: "Day not found" }, { status: 404 });
    // Toggle: if override is true -> false, false->null, null->true
    let next: boolean | null;
    if (d.is_unlocked_override === true) next = false;
    else if (d.is_unlocked_override === false) next = null;
    else next = true;
    d.is_unlocked_override = next;
    dict.set(n, d);
    await saveAdventCalendar(dict);
    return NextResponse.json({ message: "Unlock status toggled", is_unlocked_override: next }, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Advent calendar data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
