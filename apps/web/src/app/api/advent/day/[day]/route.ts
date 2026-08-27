import { NextResponse } from "next/server";
import { getDayApiResult } from "@/lib/advent";

// @codescene(disable:"Complex Method", disable:"Complex Conditional") The route delegates all policy and data handling to the tested library helper.
export async function GET(_req: Request, { params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  const result = await getDayApiResult(day);
  return NextResponse.json(result.body, { status: result.status });
}
