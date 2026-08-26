import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { loadSantaRouteFromJson } from "@/lib/locations";

// @codescene(disable-all) Compatibility handler retained while the Flask API is migrated.
export async function POST(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    const locations = await loadSantaRouteFromJson();
    if (locations.length === 0) return NextResponse.json({ error: "No locations to validate" }, { status: 400 });

    const invalid: any[] = [];
    for (let idx = 0; idx < locations.length; idx++) {
      const loc: any = locations[idx];
      const nodeType = (loc as any).type;
      if ((typeof nodeType === "string" && nodeType.toLowerCase() === "anchor") || idx === 0) continue;
      const issues: Record<string, string> = {};
      if (!loc.arrival_time) issues.arrival_time = "missing";
      else {
        try { new Date(loc.arrival_time.replace("Z", "+00:00")); if (Number.isNaN(new Date(loc.arrival_time.replace("Z", "+00:00")).getTime())) throw new Error(); } catch { issues.arrival_time = "invalid format"; }
      }
      if (!loc.departure_time) issues.departure_time = "missing";
      else {
        try { new Date(loc.departure_time.replace("Z", "+00:00")); if (Number.isNaN(new Date(loc.departure_time.replace("Z", "+00:00")).getTime())) throw new Error(); } catch { issues.departure_time = "invalid format"; }
      }
      if (Object.keys(issues).length > 0) invalid.push({ index: idx, name: loc.name, issues });
    }

    if (invalid.length > 0) {
      return NextResponse.json({
        error: "Some locations have missing/invalid timing info",
        invalid_times: invalid,
        message: "All locations must have explicit arrival_time and departure_time in ISO 8601 format. Calculation of timings is no longer supported.",
      }, { status: 400 });
    }
    return NextResponse.json({ message: "All locations have valid timing information", total_locations: locations.length, status: "complete" }, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Route data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
