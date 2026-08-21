import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { getRouteStatus } from "@/lib/locations";

export async function GET(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  try {
    const status = await getRouteStatus();
    return NextResponse.json(status, { status: 200 });
  } catch (e: any) {
    if (e.message?.includes("not found")) return NextResponse.json({ error: "Route data not found" }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
