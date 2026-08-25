import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { simulateTrialRoute } from "@/lib/admin-route-api";
import { readJsonBody, respondWith } from "@/lib/admin-api";

export async function POST(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const result = await simulateTrialRoute(await readJsonBody(req));
  return respondWith(result);
}
