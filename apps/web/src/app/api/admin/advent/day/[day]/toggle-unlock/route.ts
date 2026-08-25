import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import { toggleAdminAdventUnlock } from "@/lib/admin-advent";
import { respondWith } from "@/lib/admin-api";

export async function POST(req: Request, ctx: { params: Promise<{ day: string }> }) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const { day } = await ctx.params;
  return respondWith(await toggleAdminAdventUnlock(day));
}
