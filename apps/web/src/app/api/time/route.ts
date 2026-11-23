import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** A tiny uncached clock sample for clients estimating server time. */
export async function GET() {
  return NextResponse.json(
    { serverTime: new Date().toISOString() },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
