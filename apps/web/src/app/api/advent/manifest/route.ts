import { NextResponse } from "next/server";
import { isAdventEnabled } from "@/lib/config";
import { getManifest } from "@/lib/advent";

export async function GET() {
  if (!isAdventEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const manifest = await getManifest();
    return NextResponse.json(manifest, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Advent calendar data not found" }, { status: 404 });
    console.error("Advent manifest error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
