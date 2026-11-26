import { NextResponse } from "next/server";
import { requireAdminAuth } from "./auth";
import { readEffectiveSeasonConfig } from "./season-config";
import { readPreviewBody } from "./season-config-request";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function previewSeasonConfig(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  const body = await readPreviewBody(request);
  if (body.kind === "too-large") return NextResponse.json({ error: "Request body exceeds 8192 bytes" }, { status: 413, headers: NO_STORE });
  if (body.kind === "invalid") return NextResponse.json({ error: "Expected environment, timestamp, and known feature flag overrides" }, { status: 400, headers: NO_STORE });
  return createSeasonPreview(body.value.environment, body.value.at, body.value.overrides);
}

async function createSeasonPreview(environment: Parameters<typeof readEffectiveSeasonConfig>[0], at: Date, overrides: Parameters<typeof readEffectiveSeasonConfig>[2]): Promise<Response> {
  try {
    const effective = await readEffectiveSeasonConfig(environment, at, overrides);
    if (effective.corrupt) console.error("Stored admin season configuration is corrupt during preview", { environment });
    return NextResponse.json({ preview: effective, corrupt: effective.corrupt }, { headers: NO_STORE });
  } catch (error) {
    console.error("Admin season config preview failed", error);
    return NextResponse.json({ error: "Unable to preview season configuration" }, { status: 500, headers: NO_STORE });
  }
}
