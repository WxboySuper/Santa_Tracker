import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import {
  parseFeatureFlagOverrides,
  readEffectiveSeasonConfig,
  SEASON_CONFIG_ENVIRONMENTS,
  type SeasonConfigEnvironment,
} from "@/lib/season-config";
import { readCappedBody } from "@/lib/read-capped-body";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  const body = await readPreviewBody(request);
  if (body.kind === "too-large") return NextResponse.json({ error: "Request body exceeds 8192 bytes" }, { status: 413, headers: NO_STORE });
  if (body.kind === "invalid") return NextResponse.json({ error: "Expected environment, timestamp, and known feature flag overrides" }, { status: 400, headers: NO_STORE });
  try {
    const effective = await readEffectiveSeasonConfig(body.value.environment, body.value.at, body.value.overrides);
    if (effective.corrupt) console.error("Stored admin season configuration is corrupt during preview", { environment: body.value.environment });
    return NextResponse.json({ preview: effective, corrupt: effective.corrupt }, { headers: NO_STORE });
  } catch (error) {
    console.error("Admin season config preview failed", error);
    return NextResponse.json({ error: "Unable to preview season configuration" }, { status: 500, headers: NO_STORE });
  }
}

type PreviewBody = {
  environment: SeasonConfigEnvironment;
  at: Date;
  overrides: NonNullable<ReturnType<typeof parseFeatureFlagOverrides>>;
};
type PreviewBodyResult = { kind: "body"; value: PreviewBody } | { kind: "invalid" } | { kind: "too-large" };

async function readPreviewBody(request: Request): Promise<PreviewBodyResult> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return { kind: "invalid" };
  const bytes = await readCappedBody(request.body, 8_192);
  if (bytes.kind !== "bytes") return bytes;
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes.value)) as unknown; } catch { return { kind: "invalid" }; }
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "at,environment,overrides") return { kind: "invalid" };
  if (typeof value.environment !== "string" || !(SEASON_CONFIG_ENVIRONMENTS as readonly string[]).includes(value.environment)) return { kind: "invalid" };
  if (typeof value.at !== "string") return { kind: "invalid" };
  const at = new Date(value.at);
  if (Number.isNaN(at.getTime()) || at.toISOString() !== value.at) return { kind: "invalid" };
  const overrides = parseFeatureFlagOverrides(value.overrides);
  if (!overrides) return { kind: "invalid" };
  return { kind: "body", value: { environment: value.environment as SeasonConfigEnvironment, at, overrides } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
