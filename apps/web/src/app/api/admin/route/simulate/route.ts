import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { loadSantaRouteFromJson } from "@/lib/locations";
import { buildSimulatedFromLocations } from "@/lib/route-sim";

export async function POST(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    const data = await req.json().catch(() => ({}));
    const locations = await loadSantaRouteFromJson();
    if (locations.length === 0) return NextResponse.json({ error: "No locations to simulate" }, { status: 400 });
    const result = buildSimulatedFromLocations(locations, data.location_ids ?? null);
    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    if (e.message === "location_ids must be a list") return NextResponse.json({ error: "location_ids must be a list" }, { status: 400 });
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Route data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
