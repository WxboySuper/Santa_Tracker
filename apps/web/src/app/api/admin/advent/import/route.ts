import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import { importAdminAdventDays } from "@/lib/admin-advent";
import { readJsonBody, respondWith } from "@/lib/admin-api";

export async function POST(req: Request) {
  if (!isAdventEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status! });
  const result = await importAdminAdventDays(await readJsonBody(req));
  return respondWith(result);
}
