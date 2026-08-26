import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import { listAdminAdventDays } from "@/lib/admin-advent";
import { respondWith } from "@/lib/admin-api";

export async function GET(req: Request) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  return respondWith(await listAdminAdventDays());
}
