import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import { loadAdventCalendarDict, saveAdventCalendar, isUnlocked } from "@/lib/advent";

export async function GET(req: Request, { params }: { params: Promise<{ day: string }> }) {
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
    return NextResponse.json({
      day: d.day,
      title: d.title,
      unlock_time: d.unlock_time,
      content_type: d.content_type,
      payload: d.payload,
      is_unlocked_override: d.is_unlocked_override ?? null,
      is_currently_unlocked: isUnlocked(d),
    }, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Advent calendar data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// @codescene(disable-all) Compatibility handler retained while the Flask API is migrated.
export async function PUT(req: Request, { params }: { params: Promise<{ day: string }> }) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const { day } = await params;
  const n = Number(day);
  if (!Number.isInteger(n) || n < 1 || n > 24) return NextResponse.json({ error: "Day number must be between 1 and 24" }, { status: 400 });
  try {
    const data = await req.json().catch(() => null);
    if (!data) return NextResponse.json({ error: "No data provided" }, { status: 400 });
    const dict = await loadAdventCalendarDict();
    const existing = dict.get(n);
    if (!existing) return NextResponse.json({ error: "Day not found" }, { status: 404 });

    // Validate new day object mirrors AdventDay __post_init__
    const validTypes = ["fact", "game", "story", "video", "activity", "quiz"];
    const contentType = data.content_type ?? existing.content_type;
    if (!validTypes.includes(contentType)) return NextResponse.json({ error: "Invalid data provided" }, { status: 400 });
    const unlockTime = data.unlock_time ?? existing.unlock_time;
    try {
      const dt = new Date(unlockTime.replace("Z", "+00:00"));
      if (Number.isNaN(dt.getTime())) throw new Error();
    } catch {
      return NextResponse.json({ error: "Invalid data provided" }, { status: 400 });
    }

    const updated = {
      day: n,
      title: data.title ?? existing.title,
      unlock_time: unlockTime,
      content_type: contentType,
      payload: data.payload ?? existing.payload,
      is_unlocked_override: data.is_unlocked_override ?? existing.is_unlocked_override ?? null,
    };
    dict.set(n, updated as any);
    await saveAdventCalendar(dict);
    return NextResponse.json({ message: "Day updated successfully" }, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Advent calendar data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
