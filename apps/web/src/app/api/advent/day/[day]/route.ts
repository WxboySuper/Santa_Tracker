import { NextResponse } from "next/server";
import { getDayApiResult } from "@/lib/advent";

export async function GET(_req: Request, { params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  const result = await getDayApiResult(day);
  return NextResponse.json(result.body, { status: result.status });
}
