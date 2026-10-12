import { NextResponse } from "next/server";
import { isAdventEnabled } from "@/lib/config";
import { getArchiveDayContent, parseDayNumber } from "@/lib/advent";

const NO_STORE = { "Cache-Control": "private, no-store" };

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ day: string }> }) {
  if (!isAdventEnabled()) return jsonError("Not found", 404);
  try {
    const { day: rawDay } = await params;
    const day = parseDayNumber(rawDay);
    if (day === null) return dayNotFound();
    const content = await getArchiveDayContent(day);
    if (content === null) return dayNotFound();
    if (!content.is_unlocked) return lockedDay(content);
    return NextResponse.json(content, { headers: NO_STORE });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("not found")) return jsonError("Advent calendar data not found", 404);
    console.error("Advent archive error", error);
    return jsonError("Internal server error", 500);
  }
}

function dayNotFound(): NextResponse {
  return jsonError("Day not found", 404);
}

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function lockedDay(content: { day: number; title: string; unlock_time: string }): NextResponse {
  return NextResponse.json(
    { error: "Day is locked", day: content.day, title: content.title, unlock_time: content.unlock_time },
    { status: 403, headers: NO_STORE },
  );
}
