import { NextResponse } from "next/server";
import { readEmergencyControls } from "@/lib/emergency-controls";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readEmergencyControls();
    return NextResponse.json({
      noMap: state.noMap,
      simplifiedTracker: state.simplifiedTracker,
      killedFeatures: state.killedFeatures,
      updatedAt: state.updatedAt,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({
      noMap: true,
      simplifiedTracker: true,
      killedFeatures: { weather: true, soundscape: true },
      updatedAt: "",
    }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
