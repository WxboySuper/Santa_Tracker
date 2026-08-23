import { NextResponse } from "next/server";
import { isAdventEnabled } from "@/lib/config";
import { getDayContent, type AdventPublicDay } from "@/lib/advent";

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("not found");
}

function lockedDayResponse(content: AdventPublicDay): NextResponse {
  return NextResponse.json(
    {
      error: "Day is locked",
      day: content.day,
      title: content.title,
      unlock_time: content.unlock_time,
    },
    { status: 403 },
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ day: string }> }) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { day } = await params;
  const dayNumber = Number(day);
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 24) {
    return NextResponse.json({ error: "Day not found" }, { status: 404 });
  }
  try {
    const content = await getDayContent(dayNumber);
    if (!content) return NextResponse.json({ error: "Day not found" }, { status: 404 });
    if (!content.is_unlocked) return lockedDayResponse(content);
    return NextResponse.json(content, { status: 200 });
  } catch (error: unknown) {
    if (isNotFoundError(error)) return NextResponse.json({ error: "Advent calendar data not found" }, { status: 404 });
    console.error("Advent day error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
