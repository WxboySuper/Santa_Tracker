import { NextResponse } from "next/server";
import { getDayApiResult } from "@/lib/advent";
import { ADVENT_NO_STORE_HEADERS } from "@/lib/advent-http";

export async function GET(_request: Request, context: { params: Promise<{ day: string }> }) {
  const { day } = await context.params;
  const result = await getDayApiResult(day);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: ADVENT_NO_STORE_HEADERS,
  });
}
