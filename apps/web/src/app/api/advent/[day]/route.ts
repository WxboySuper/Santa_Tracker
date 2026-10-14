import { NextResponse } from "next/server";
import { getDayApiResult } from "@/lib/advent";
import { ADVENT_NO_STORE_HEADERS } from "@/lib/advent-http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ day: string }> }) {
  try {
    const { day } = await context.params;
    const result = await getDayApiResult(day);
    return NextResponse.json(result.body, {
      status: result.status,
      headers: ADVENT_NO_STORE_HEADERS,
    });
  } catch (error: unknown) {
    console.error("Advent day route error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: ADVENT_NO_STORE_HEADERS },
    );
  }
}
