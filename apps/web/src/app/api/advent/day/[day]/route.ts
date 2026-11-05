import { NextResponse } from "next/server";
import { gatedFeature } from "@/lib/access";
import { getDayApiResult } from "@/lib/advent";
import { ADVENT_NO_STORE_HEADERS } from "@/lib/advent-http";

export const dynamic = "force-dynamic";

// @codescene(disable:"Complex Method", disable:"Complex Conditional") The route delegates all policy and data handling to the tested library helper.
async function getDayResponse(_req: Request, { params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  const result = await getDayApiResult(day);
  return NextResponse.json(result.body, { status: result.status, headers: ADVENT_NO_STORE_HEADERS });
}

export const GET = gatedFeature("advent", getDayResponse);
