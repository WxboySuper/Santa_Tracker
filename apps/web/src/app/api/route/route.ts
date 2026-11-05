import { NextResponse } from "next/server";
import { closedResponse, featureAccess } from "@/lib/access";
import { loadRouteNodesRaw } from "@/lib/locations";

// Visibility depends on the clock and the caller's credentials, so this must never be prerendered
// or statically optimized (every other gated route sets this too).
export const dynamic = "force-dynamic";

const PUBLIC_CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=60";
const NO_STORE = "private, no-store";

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
      { status: 200, headers: { "Cache-Control": access === "open" ? PUBLIC_CACHE : NO_STORE } },
    );
  } catch (error: unknown) {
    console.error("Santa route error", error);
    // Never cacheable, even when the tracker is open: a transient store failure cached for a minute
    // would hide the tracker from visitors on Christmas Eve after the store has recovered.
    return NextResponse.json({ error: "Santa route data not found" }, { status: 404, headers: { "Cache-Control": NO_STORE } });
  }
}
