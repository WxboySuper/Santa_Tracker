import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { loadSantaRouteFromJson } from "@/lib/locations";

export async function GET(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    const locations = await loadSantaRouteFromJson();
    const backup = {
      backup_timestamp: new Date().toISOString(),
      total_locations: locations.length,
      route: locations.map(loc => ({
        name: loc.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        utc_offset: loc.utc_offset,
        arrival_time: loc.arrival_time,
        departure_time: loc.departure_time,
        country: loc.country,
        population: loc.population,
        priority: loc.priority,
        notes: loc.notes,
        fun_facts: loc.notes,
        stop_duration: loc.stop_duration,
        is_stop: loc.is_stop,
      })),
    };
    return NextResponse.json(backup, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Route data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
