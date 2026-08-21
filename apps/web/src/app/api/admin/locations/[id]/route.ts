import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { loadSantaRouteFromJson, saveSantaRouteToJson } from "@/lib/locations";

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

    try {
      const notes = "notes" in data ? data.notes : ("fun_facts" in data ? data.fun_facts : locations[locationId].notes);
      const updated = {
        ...locations[locationId],
        name: data.name ?? locations[locationId].name,
        latitude: data.latitude != null ? Number(data.latitude) : locations[locationId].latitude,
        longitude: data.longitude != null ? Number(data.longitude) : locations[locationId].longitude,
        utc_offset: data.utc_offset != null ? Number(data.utc_offset) : locations[locationId].utc_offset,
        arrival_time: data.arrival_time ?? locations[locationId].arrival_time,
        departure_time: data.departure_time ?? locations[locationId].departure_time,
        country: data.country ?? locations[locationId].country,
        population: data.population ?? locations[locationId].population,
        priority: data.priority ?? locations[locationId].priority,
        notes,
        fun_facts: notes,
        stop_duration: data.stop_duration ?? locations[locationId].stop_duration,
        is_stop: data.is_stop ?? locations[locationId].is_stop,
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
    await saveSantaRouteToJson(locations);
    return NextResponse.json({ message: "Location deleted successfully", deleted_location: deleted.name }, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Location data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
