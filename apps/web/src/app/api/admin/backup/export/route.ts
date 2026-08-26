import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { exportBackup } from "@/lib/admin-locations";
import { respondWith } from "@/lib/admin-api";

export async function GET(req: Request) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  return respondWith(await exportBackup());
}
