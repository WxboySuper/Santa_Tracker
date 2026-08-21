import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { loadSantaRouteFromJson, saveSantaRouteToJson, createLocationFromPayload } from "@/lib/locations";

export async function GET(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    const locations = await loadSantaRouteFromJson();
    return NextResponse.json({
      locations: locations.map((loc, idx) => ({
        id: idx,
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
    }, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Location data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    const data = await req.json().catch(() => null);
    if (!data) return NextResponse.json({ error: "No data provided" }, { status: 400 });
    const required = ["name", "latitude", "longitude", "utc_offset"];
    const missing = required.filter(f => !(f in data));
    if (missing.length > 0) return NextResponse.json({ error: `Missing required fields: ${missing}` }, { status: 400 });

    // range checks mirroring Flask
    const lat = Number(data.latitude);
    const lon = Number(data.longitude);
    const tz = Number(data.utc_offset);
    if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(tz)) {
      return NextResponse.json({ error: "Invalid data format or values" }, { status: 400 });
    }
    if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180) || !(tz >= -12 && tz <= 14)) {
      return NextResponse.json({ error: "Invalid data format or values" }, { status: 400 });
    }
    let newLocation;
    try {
      newLocation = createLocationFromPayload(data);
    } catch {
      return NextResponse.json({ error: "Invalid data format or values" }, { status: 400 });
    }
    const locations = await loadSantaRouteFromJson();
    locations.push(newLocation);
    await saveSantaRouteToJson(locations);
    return NextResponse.json({
      message: "Location added successfully",
      id: locations.length - 1,
      location: { name: newLocation.name, latitude: newLocation.latitude, longitude: newLocation.longitude, utc_offset: newLocation.utc_offset },
    }, { status: 201 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Location data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
