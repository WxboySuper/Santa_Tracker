import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import { previewAdminAdventDays } from "@/lib/admin-advent";
import { respondWith } from "@/lib/admin-api";

export async function GET(req: Request) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const rawTime = new URL(req.url).searchParams.get("at");
  if (!rawTime) return NextResponse.json({ error: "The 'at' query parameter is required" }, { status: 400 });
  const previewTime = new Date(rawTime);
  return respondWith(await previewAdminAdventDays(previewTime));
}
