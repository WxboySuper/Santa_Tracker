import { NextResponse } from "next/server";
import { isAdventEnabled } from "@/lib/config";
import { getManifest, isAdventDataNotFoundError } from "@/lib/advent";
import { isNotFoundError } from "@/lib/errors";
import { ADVENT_NO_STORE_HEADERS } from "@/lib/advent-http";

export async function GET() {
  if (!isAdventEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: ADVENT_NO_STORE_HEADERS });
  }
  try {
    const manifest = await getManifest();
    return NextResponse.json(manifest, {
      status: 200,
      headers: ADVENT_NO_STORE_HEADERS,
    });
  } catch (error: unknown) {
    if (isAdventDataNotFoundError(error) || isNotFoundError(error)) {
      return NextResponse.json({ error: "Advent calendar data not found" }, { status: 404, headers: ADVENT_NO_STORE_HEADERS });
    }
    console.error("Advent manifest error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: ADVENT_NO_STORE_HEADERS });
  }
}
