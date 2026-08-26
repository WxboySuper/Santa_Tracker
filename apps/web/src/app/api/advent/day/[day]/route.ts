import { NextResponse } from "next/server";
import { isAdventEnabled } from "@/lib/config";
import { getDayContent } from "@/lib/advent";

function parseDayNumber(day: string): number | null {
  const dayNumber = Number(day);
  return Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 24 ? dayNumber : null;
}

async function getDayResponse(dayNumber: number) {
  const content = await getDayContent(dayNumber);
  if (!content) return NextResponse.json({ error: "Day not found" }, { status: 404 });
  if (content.is_unlocked) return NextResponse.json(content, { status: 200 });

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
  if (!isAdventEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { day } = await params;
  const dayNumber = parseDayNumber(day);
  if (dayNumber === null) {
    return NextResponse.json({ error: "Day not found" }, { status: 404 });
  }
  try {
    return await getDayResponse(dayNumber);
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Advent calendar data not found" }, { status: 404 });
    console.error("Advent day error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
