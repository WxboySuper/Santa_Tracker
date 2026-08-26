import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { addLocation, listLocations } from "@/lib/admin-locations";
import { readJsonBody, respondWith } from "@/lib/admin-api";

export async function GET(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  return respondWith(await listLocations());
}

export async function POST(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const result = await addLocation(await readJsonBody(req));
  return respondWith(result);
}
