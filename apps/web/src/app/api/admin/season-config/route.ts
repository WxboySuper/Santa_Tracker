import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import {
  getSeasonConfigEnvironment,
  parseFeatureFlagOverrides,
  readEffectiveSeasonConfig,
  SEASON_CONFIG_ENVIRONMENTS,
  type SeasonConfigEnvironment,
} from "@/lib/season-config";
import { getKeyValueStore } from "@/lib/storage";
import { getSantaSnapshotsBucket } from "@/lib/cloudflare-bindings";
import { createSeasonConfigRepository } from "@/lib/season-config";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  const url = new URL(request.url);
  const environment = requestedEnvironment(url.searchParams.get("environment"));
  if (!environment) return NextResponse.json({ error: "Unknown configuration environment" }, { status: 400, headers: NO_STORE });
  const at = requestedTime(url.searchParams.get("at"));
  if (!at) return NextResponse.json({ error: "at must be a canonical UTC timestamp" }, { status: 400, headers: NO_STORE });
  try {
    const repository = createSeasonConfigRepository(getKeyValueStore(getSantaSnapshotsBucket()));
    const state = await repository.read(environment);
    const effective = await readEffectiveSeasonConfig(environment, at);
    return NextResponse.json({ state, effective }, { headers: { ...NO_STORE, ETag: makeEtag(state.updatedAt) } });
  } catch (error) {
    console.error("Admin season config read failed", error);
    return NextResponse.json({ error: "Unable to read season configuration" }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  const environment = requestedEnvironment(new URL(request.url).searchParams.get("environment"));
  if (!environment) return NextResponse.json({ error: "Unknown configuration environment" }, { status: 400, headers: NO_STORE });
  const expectedUpdatedAt = parseEtag(request.headers.get("if-match"));
  if (expectedUpdatedAt === null) return NextResponse.json({ error: "If-Match is required. Read the current environment config first." }, { status: 428, headers: NO_STORE });
  const body = await readUpdateBody(request);
  if (!body) return NextResponse.json({ error: "Expected known flag overrides and a reason" }, { status: 400, headers: NO_STORE });
  if (hasExpiredOverride(body.overrides)) return NextResponse.json({ error: "New flag overrides must expire in the future" }, { status: 400, headers: NO_STORE });
  try {
    const repository = createSeasonConfigRepository(getKeyValueStore(getSantaSnapshotsBucket()));
    const state = await repository.replace(environment, expectedUpdatedAt, body.overrides, "admin", body.reason);
    if (!state) return NextResponse.json({ error: "Configuration changed. Reload before retrying." }, { status: 412, headers: NO_STORE });
    const effective = await readEffectiveSeasonConfig(environment, new Date());
    return NextResponse.json({ state, effective }, { headers: { ...NO_STORE, ETag: makeEtag(state.updatedAt) } });
  } catch (error) {
    console.error("Admin season config write failed", error);
    return NextResponse.json({ error: "Unable to save season configuration" }, { status: 500, headers: NO_STORE });
  }
}

async function readUpdateBody(request: Request): Promise<{ overrides: NonNullable<ReturnType<typeof parseFeatureFlagOverrides>>; reason: string } | null> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 8_192) return null;
  const value: unknown = await request.json().catch(() => null);
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "overrides,reason") return null;
  const overrides = parseFeatureFlagOverrides(value.overrides);
  if (!overrides || typeof value.reason !== "string") return null;
  const reason = value.reason.trim();
  return reason.length > 0 && reason.length <= 500 ? { overrides, reason } : null;
}

function requestedEnvironment(value: string | null): SeasonConfigEnvironment | null {
  if (value === null) return getSeasonConfigEnvironment();
  return (SEASON_CONFIG_ENVIRONMENTS as readonly string[]).includes(value) ? value as SeasonConfigEnvironment : null;
}

function requestedTime(value: string | null): Date | null {
  if (value === null) return new Date();
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value ? date : null;
}

function hasExpiredOverride(overrides: NonNullable<ReturnType<typeof parseFeatureFlagOverrides>>): boolean {
  const now = Date.now();
  return Object.values(overrides).some(override => override?.expiresAt !== null && override?.expiresAt !== undefined && Date.parse(override.expiresAt) <= now);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function makeEtag(updatedAt: string): string { return `"${updatedAt}"`; }
function parseEtag(value: string | null): string | null {
  const match = value && /^"([^"]*)"$/.exec(value);
  return match ? match[1] ?? null : null;
}
