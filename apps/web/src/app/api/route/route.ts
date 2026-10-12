import { NextResponse } from "next/server";
import { loadRouteNodesRaw } from "@/lib/locations";

/** Public tracker route data is read from the active snapshot so admin edits publish immediately. */
export async function GET() {
  try {
    const route_nodes = await loadRouteNodesRaw();
    return NextResponse.json(
      { route_nodes },
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60" },
      },
    );
  } catch (error: unknown) {
    console.error("Santa route error", error);
    return NextResponse.json({ error: "Santa route data not found" }, { status: 404 });
  }
}
