import { NextResponse } from "next/server";
import { getArchiveDayApiResult } from "@/lib/advent";
import { ADVENT_NO_STORE_HEADERS } from "@/lib/advent-http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ day: string }> }) {
  try {
    const { day } = await params;
    const result = await getArchiveDayApiResult(day);
    return NextResponse.json(result.body, { status: result.status, headers: ADVENT_NO_STORE_HEADERS });
  } catch (error: unknown) {
    console.error("Advent archive day error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: ADVENT_NO_STORE_HEADERS });
  }
}
