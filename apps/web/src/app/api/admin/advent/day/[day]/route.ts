import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import {
  getAdminAdventDay,
  updateAdminAdventDay,
} from "@/lib/admin-advent";
import { readJsonBody, respondWith } from "@/lib/admin-api";

export async function GET(req: Request, ctx: { params: Promise<{ day: string }> }) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const { day } = await ctx.params;
  return respondWith(await getAdminAdventDay(day));
}

export async function PUT(req: Request, ctx: { params: Promise<{ day: string }> }) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const { day } = await ctx.params;
  const result = await updateAdminAdventDay(day, await readJsonBody(req));
  return respondWith(result);
}
