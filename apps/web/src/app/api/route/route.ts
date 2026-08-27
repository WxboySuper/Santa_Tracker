import { NextResponse } from "next/server";
import { loadRouteNodesRaw } from "@/lib/locations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const route_nodes = await loadRouteNodesRaw();
    return NextResponse.json(
      { route_nodes },
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
      },
    );
  } catch (error: unknown) {
    console.error("Santa route error", error);
    return NextResponse.json({ error: "Santa route data not found" }, { status: 404 });
  }
}
