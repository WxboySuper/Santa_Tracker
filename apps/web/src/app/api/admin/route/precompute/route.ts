import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { precomputeTimings } from "@/lib/admin-route-api";
import { respondWith } from "@/lib/admin-api";

export async function POST(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  return respondWith(await precomputeTimings());
}
