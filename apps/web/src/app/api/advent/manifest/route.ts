import { NextResponse } from "next/server";
import { isAdventEnabled } from "@/lib/config";
import { getManifest } from "@/lib/advent";
import { isNotFoundError } from "@/lib/errors";

export async function GET() {
  if (!isAdventEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const manifest = await getManifest();
    return NextResponse.json(manifest, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error: unknown) {
    if (isNotFoundError(error)) return NextResponse.json({ error: "Advent calendar data not found" }, { status: 404 });
    console.error("Advent manifest error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
