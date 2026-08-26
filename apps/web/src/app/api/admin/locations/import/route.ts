import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { loadSantaRouteFromJson, saveSantaRouteToJson, createLocationFromPayload } from "@/lib/locations";

// @codescene(disable-all) Compatibility handler retained while the Flask API is migrated.
export async function POST(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    const data = await req.json().catch(() => null);
    if (!data) return NextResponse.json({ error: "No data provided" }, { status: 400 });
    const mode = data.mode ?? "append";
    const locationsData = data.locations;
    if (!Array.isArray(locationsData)) return NextResponse.json({ error: "Locations must be a list" }, { status: 400 });
    if (locationsData.length === 0) return NextResponse.json({ error: "No locations provided" }, { status: 400 });

    const newLocations: any[] = [];
    const errors: string[] = [];

    for (let idx = 0; idx < locationsData.length; idx++) {
      const loc = locationsData[idx];
      const name = loc.name ?? loc.location;
      if (!name) {
        errors.push(`Location at index ${idx}: Missing required field 'name' or 'location'`);
        continue;
      }
      const lat = loc.latitude ?? loc.lat;
      const lon = loc.longitude ?? loc.lng;
      const tz = loc.utc_offset ?? loc.timezone_offset;
      if (lat == null || lon == null || tz == null) {
        const missing: string[] = [];
        if (lat == null) missing.push("latitude");
        if (lon == null) missing.push("longitude");
        if (tz == null) missing.push("utc_offset");
        errors.push(`Location at index ${idx}: Missing required field(s): ${missing.join(", ")}`);
        continue;
      }
      const latVal = Number(lat);
      const lonVal = Number(lon);
      const tzVal = Number(tz);
      if (Number.isNaN(latVal) || Number.isNaN(lonVal) || Number.isNaN(tzVal)) {
        errors.push(`Location at index ${idx}: Invalid data`);
        continue;
      }
      if (!(latVal >= -90 && latVal <= 90)) { errors.push(`Location at index ${idx}: Invalid latitude`); continue; }
      if (!(lonVal >= -180 && lonVal <= 180)) { errors.push(`Location at index ${idx}: Invalid longitude`); continue; }
      if (!(tzVal >= -12 && tzVal <= 14)) { errors.push(`Location at index ${idx}: Invalid utc_offset`); continue; }

      try {
        const location = createLocationFromPayload(loc);
        newLocations.push(location);
      } catch {
        errors.push(`Location at index ${idx}: Invalid data`);
      }
    }

    if (errors.length > 0 && newLocations.length === 0) {
      return NextResponse.json({ error: "No valid locations to import", details: errors }, { status: 400 });
    }

    let final: any[];
    if (mode === "replace") final = newLocations;
    else {
      const existing = await loadSantaRouteFromJson();
      final = [...existing, ...newLocations];
    }
    await saveSantaRouteToJson(final);
    return NextResponse.json({
      message: `Successfully imported ${newLocations.length} location(s)`,
      imported: newLocations.length,
      errors: errors.length > 0 ? errors : null,
      mode,
    }, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Location data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
