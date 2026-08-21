import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { loadTrialRouteFromJson, hasTrialRoute } from "@/lib/locations";
import { buildSimulatedFromLocations } from "@/lib/route-sim";

export async function POST(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    if (!hasTrialRoute()) return NextResponse.json({ error: "No trial route to simulate" }, { status: 404 });
    const data = await req.json().catch(() => ({}));
    const locations = await loadTrialRouteFromJson();
    if (!locations || locations.length === 0) return NextResponse.json({ error: "Trial route is empty" }, { status: 400 });
    const result = buildSimulatedFromLocations(locations, data.location_ids ?? null);
    return NextResponse.json({ ...result, is_trial: true }, { status: 200 });
  } catch (e: any) {
    if (e.message === "location_ids must be a list") return NextResponse.json({ error: "location_ids must be a list" }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
