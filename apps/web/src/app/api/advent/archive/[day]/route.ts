import { NextResponse } from "next/server";
import { isAdventEnabled } from "@/lib/config";
import { getArchiveDayContent } from "@/lib/advent";

export async function GET(_req: Request, { params }: { params: Promise<{ day: string }> }) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { day: rawDay } = await params;
  const day = parseArchiveDay(rawDay);
  if (day === null) return dayNotFound();
  const content = await getArchiveDayContent(day);
  if (content === null) return dayNotFound();
  if (!content.is_unlocked) return NextResponse.json({ error: "Day is not yet archived" }, { status: 403 });
  return NextResponse.json(content, { headers: { "Cache-Control": "private, no-store" } });
}

function parseArchiveDay(rawDay: string): number | null {
  const day = Number(rawDay);
  return Number.isInteger(day) && day >= 1 && day <= 24 ? day : null;
}

function dayNotFound(): NextResponse {
  return NextResponse.json({ error: "Day not found" }, { status: 404 });
}
