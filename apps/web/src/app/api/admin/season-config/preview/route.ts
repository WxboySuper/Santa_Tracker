import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import {
  parseFeatureFlagOverrides,
  readEffectiveSeasonConfig,
  SEASON_CONFIG_ENVIRONMENTS,
  type SeasonConfigEnvironment,
} from "@/lib/season-config";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  const body = await readPreviewBody(request);
  if (!body) return NextResponse.json({ error: "Expected environment, timestamp, and known feature flag overrides" }, { status: 400, headers: NO_STORE });
  try {
    const effective = await readEffectiveSeasonConfig(body.environment, body.at, body.overrides);
    return NextResponse.json({ preview: effective }, { headers: NO_STORE });
  } catch (error) {
    console.error("Admin season config preview failed", error);
    return NextResponse.json({ error: "Unable to preview season configuration" }, { status: 500, headers: NO_STORE });
  }
}

async function readPreviewBody(request: Request): Promise<{
  environment: SeasonConfigEnvironment;
  at: Date;
  overrides: NonNullable<ReturnType<typeof parseFeatureFlagOverrides>>;
} | null> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  const value: unknown = await request.json().catch(() => null);
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "at,environment,overrides") return null;
  if (typeof value.environment !== "string" || !(SEASON_CONFIG_ENVIRONMENTS as readonly string[]).includes(value.environment)) return null;
  if (typeof value.at !== "string") return null;
  const at = new Date(value.at);
  if (Number.isNaN(at.getTime()) || at.toISOString() !== value.at) return null;
  const overrides = parseFeatureFlagOverrides(value.overrides);
  if (!overrides) return null;
  return { environment: value.environment as SeasonConfigEnvironment, at, overrides };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
