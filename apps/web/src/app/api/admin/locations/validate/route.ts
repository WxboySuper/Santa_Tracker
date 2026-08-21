import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { loadSantaRouteFromJson, validateLocations } from "@/lib/locations";

export async function POST(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    const locations = await loadSantaRouteFromJson();
    const result = validateLocations(locations);
    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Location data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
