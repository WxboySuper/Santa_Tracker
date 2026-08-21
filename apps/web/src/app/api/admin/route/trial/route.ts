import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { loadTrialRouteFromJson, saveTrialRouteToJson, deleteTrialRoute, hasTrialRoute, createLocationFromPayload, validateLocations } from "@/lib/locations";

export async function GET(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    const exists = hasTrialRoute();
    if (exists) {
      const trial = await loadTrialRouteFromJson();
      return NextResponse.json({ exists: true, location_count: trial?.length ?? 0 }, { status: 200 });
    }
    return NextResponse.json({ exists: false, location_count: 0 }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    const data = await req.json().catch(() => null);
    if (!data || !data.route) return NextResponse.json({ error: "Route data required" }, { status: 400 });
    const locations: any[] = [];
    for (const locData of data.route) {
      try {
        const loc = createLocationFromPayload(locData);
        locations.push(loc);
      } catch {
        return NextResponse.json({ error: "Invalid location data." }, { status: 400 });
      }
    }
    const validation = validateLocations(locations);
    if (validation.errors.length > 0) {
      return NextResponse.json({ error: "Validation failed", errors: validation.errors, warnings: validation.warnings }, { status: 400 });
    }
    await saveTrialRouteToJson(locations);
    return NextResponse.json({ success: true, message: `Trial route uploaded with ${locations.length} locations`, location_count: locations.length, warnings: validation.warnings }, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Route file not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    const deleted = await deleteTrialRoute();
    if (deleted) return NextResponse.json({ success: true, message: "Trial route deleted" }, { status: 200 });
    return NextResponse.json({ success: false, message: "No trial route to delete" }, { status: 404 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
