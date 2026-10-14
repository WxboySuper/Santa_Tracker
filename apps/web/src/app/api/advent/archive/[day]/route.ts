import { NextResponse } from "next/server";
import { getArchiveDayApiResult } from "@/lib/advent";
import { ADVENT_NO_STORE_HEADERS } from "@/lib/advent-http";

export const dynamic = "force-dynamic";

type AdventDayContext = { params: Promise<{ day: string }> };

export function GET(_req: Request, { params }: AdventDayContext) {
  return getArchiveDayResponse(params);
}

async function getArchiveDayResponse(params: AdventDayContext["params"]) {
  try {
    const { day } = await params;
    const result = await getArchiveDayApiResult(day);
    return NextResponse.json(result.body, { status: result.status, headers: ADVENT_NO_STORE_HEADERS });
  } catch (error: unknown) {
    console.error("Advent archive day route error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: ADVENT_NO_STORE_HEADERS });
  }
}
