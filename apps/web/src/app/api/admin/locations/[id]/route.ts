import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { loadSantaRouteFromJson, saveSantaRouteToJson } from "@/lib/locations";

// @codescene(disable-all) Compatibility handler retained while the Flask API is migrated.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const { id } = await params;
  const locationId = Number(id);
  try {
    const data = await req.json().catch(() => null);
    if (!data) return NextResponse.json({ error: "No data provided" }, { status: 400 });
    const locations = await loadSantaRouteFromJson();
    if (locationId < 0 || locationId >= locations.length) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    const location = locations[locationId];
    if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

    try {
      const notes = "notes" in data ? data.notes : ("fun_facts" in data ? data.fun_facts : location.notes);
      const updated = {
        ...location,
        name: data.name ?? location.name,
        latitude: data.latitude != null ? Number(data.latitude) : location.latitude,
        longitude: data.longitude != null ? Number(data.longitude) : location.longitude,
        utc_offset: data.utc_offset != null ? Number(data.utc_offset) : location.utc_offset,
        arrival_time: data.arrival_time ?? location.arrival_time,
        departure_time: data.departure_time ?? location.departure_time,
        country: data.country ?? location.country,
        population: data.population ?? location.population,
        priority: data.priority ?? location.priority,
        notes,
        fun_facts: notes,
        stop_duration: data.stop_duration ?? location.stop_duration,
        is_stop: data.is_stop ?? location.is_stop,
      };
      // Mirror Flask: validate numeric conversion
      if (updated.latitude != null && (Number.isNaN(Number(updated.latitude)) || Number(updated.latitude) < -90 || Number(updated.latitude) > 90)) throw new Error("invalid");
      if (updated.longitude != null && (Number.isNaN(Number(updated.longitude)) || Number(updated.longitude) < -180 || Number(updated.longitude) > 180)) throw new Error("invalid");
      if (updated.utc_offset != null && (Number.isNaN(Number(updated.utc_offset)) || Number(updated.utc_offset) < -12 || Number(updated.utc_offset) > 14)) throw new Error("invalid");
      updated.latitude = Number(updated.latitude);
      updated.longitude = Number(updated.longitude);
      updated.utc_offset = Number(updated.utc_offset);
      updated.lat = updated.latitude;
      updated.lng = updated.longitude;
      updated.timezone_offset = updated.utc_offset;

      locations[locationId] = updated as any;
      await saveSantaRouteToJson(locations);
      return NextResponse.json({ message: "Location updated successfully" }, { status: 200 });
    } catch {
      return NextResponse.json({ error: "Invalid data format or values" }, { status: 400 });
    }
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Location data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const { id } = await params;
  const locationId = Number(id);
  try {
    const locations = await loadSantaRouteFromJson();
    if (locationId < 0 || locationId >= locations.length) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    const deleted = locations.splice(locationId, 1)[0];
    if (!deleted) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    await saveSantaRouteToJson(locations);
    return NextResponse.json({ message: "Location deleted successfully", deleted_location: deleted.name }, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Location data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
