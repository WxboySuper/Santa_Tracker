import { NextResponse } from "next/server";
import { closedResponse, featureAccess } from "@/lib/access";
import { loadRouteNodesRaw } from "@/lib/locations";

/**
 * Public tracker route data is read from the active snapshot so admin edits publish immediately.
 * Hidden from visitors until the tracker opens (see season.ts); an admin can still read it, and
 * that response is never cached so it cannot reach a visitor.
 */
export async function GET(request: Request) {
  const access = await featureAccess("tracker", request);
  if (access === "closed") return closedResponse();
  try {
    const route_nodes = await loadRouteNodesRaw();
    return NextResponse.json(
      { route_nodes },
      {
        status: 200,
        headers: {
          "Cache-Control":
            access === "open" ? "public, max-age=0, s-maxage=60, stale-while-revalidate=60" : "private, no-store",
        },
      },
    );
  } catch (error: unknown) {
    console.error("Santa route error", error);
    return NextResponse.json({ error: "Santa route data not found" }, { status: 404 });
  }
}
