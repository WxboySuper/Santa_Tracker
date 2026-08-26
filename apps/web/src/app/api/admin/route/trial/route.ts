import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import {
  removeTrialRoute,
  trialRouteInfo,
  uploadTrialRoute,
} from "@/lib/admin-route-api";
import { readJsonBody, respondWith } from "@/lib/admin-api";

export async function GET(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  return respondWith(await trialRouteInfo());
}

export async function POST(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const result = await uploadTrialRoute(await readJsonBody(req));
  return respondWith(result);
}

export async function DELETE(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  return respondWith(await removeTrialRoute());
}
