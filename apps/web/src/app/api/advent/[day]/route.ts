import { NextResponse } from "next/server";
import { getDayApiResult } from "@/lib/advent";

export async function GET(_request: Request, context: { params: Promise<{ day: string }> }) {
  const { day } = await context.params;
  const result = await getDayApiResult(day);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
