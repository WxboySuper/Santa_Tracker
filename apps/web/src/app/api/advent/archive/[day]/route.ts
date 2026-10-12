import { NextResponse } from "next/server";
import { getArchiveDayApiResult } from "@/lib/advent";

const NO_STORE = { "Cache-Control": "private, no-store" };

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ day: string }> }) {
  try {
    const { day } = await params;
    const result = await getArchiveDayApiResult(day);
    return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (error: unknown) {
    console.error("Advent archive route error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE });
  }
}
