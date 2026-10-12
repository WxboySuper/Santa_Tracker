import { NextResponse } from "next/server";
import { isAdventEnabled } from "@/lib/config";
import { getArchiveDayContent, parseDayNumber } from "@/lib/advent";

const NO_STORE = { "Cache-Control": "private, no-store" };

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ day: string }> }) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  try {
    const { day: rawDay } = await params;
    if (!/^(?:[1-9]|1\d|2[0-4])$/.test(rawDay)) return dayNotFound();
    const day = parseDayNumber(rawDay);
    if (day === null) return dayNotFound();
    const content = await getArchiveDayContent(day);
    if (content === null) return dayNotFound();
    if (!content.is_unlocked) return NextResponse.json({ error: "Day is locked", day: content.day, title: content.title, unlock_time: content.unlock_time }, { status: 403, headers: NO_STORE });
    return NextResponse.json(content, { headers: NO_STORE });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("not found")) return NextResponse.json({ error: "Advent calendar data not found" }, { status: 404, headers: NO_STORE });
    console.error("Advent archive error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE });
  }
}

function dayNotFound(): NextResponse {
  return NextResponse.json({ error: "Day not found" }, { status: 404, headers: NO_STORE });
}
