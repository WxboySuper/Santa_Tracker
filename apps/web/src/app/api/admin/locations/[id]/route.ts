import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { deleteLocation, updateLocation } from "@/lib/admin-locations";
import { readJsonBody, respondWith } from "@/lib/admin-api";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const { id } = await ctx.params;
  const result = await updateLocation(Number(id), await readJsonBody(req));
  return respondWith(result);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const { id } = await ctx.params;
  return respondWith(await deleteLocation(Number(id)));
}
