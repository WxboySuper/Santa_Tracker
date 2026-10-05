import { NextResponse } from "next/server";
import { loadRouteNodesRaw } from "@/lib/locations";

/** Legacy/admin path — public tracker reads static `/data/santa_route.json`. */
export async function GET() {
  try {
    const route_nodes = await loadRouteNodesRaw();
    return NextResponse.json(
      { route_nodes },
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=900, stale-while-revalidate=3600" },
      },
    );
  } catch (error: unknown) {
    console.error("Santa route error", error);
    return NextResponse.json({ error: "Santa route data not found" }, { status: 404 });
  }
}
