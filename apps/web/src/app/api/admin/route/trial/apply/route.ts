import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { loadTrialRouteFromJson, saveSantaRouteToJson, hasTrialRoute } from "@/lib/locations";

export async function POST(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    if (!hasTrialRoute()) return NextResponse.json({ error: "No trial route to apply" }, { status: 404 });
    const trial = await loadTrialRouteFromJson();
    if (!trial || trial.length === 0) return NextResponse.json({ error: "Trial route is empty" }, { status: 400 });
    await saveSantaRouteToJson(trial);
    return NextResponse.json({ success: true, message: `Trial route applied as main route (${trial.length} locations)` }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
