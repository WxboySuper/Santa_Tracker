import { NextResponse } from "next/server";
import { isAdventEnabled } from "@/lib/config";
import { getArchiveDayContent } from "@/lib/advent";

export async function GET(_req: Request, { params }: { params: Promise<{ day: string }> }) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { day: rawDay } = await params;
  const day = Number(rawDay);
  if (!Number.isInteger(day) || day < 1 || day > 24) return NextResponse.json({ error: "Day not found" }, { status: 404 });
  const content = await getArchiveDayContent(day);
  if (!content) return NextResponse.json({ error: "Day not found" }, { status: 404 });
  if (!content.is_unlocked) return NextResponse.json({ error: "Day is not yet archived" }, { status: 403 });
  return NextResponse.json(content, { headers: { "Cache-Control": "private, no-store" } });
}
