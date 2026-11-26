import { NextResponse } from "next/server";
import { requireAdminAuth } from "./auth";
import { getKeyValueStore } from "./storage";
import { getSantaSnapshotsBucket } from "./cloudflare-bindings";
import { createSeasonConfigRepository, getSeasonConfigEnvironment, parseFeatureFlagOverrides, readEffectiveSeasonConfig, SeasonConfigCorruptError, SEASON_CONFIG_ENVIRONMENTS, type SeasonConfigEnvironment } from "./season-config";
import { readUpdateBody } from "./season-config-request";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function putSeasonConfig(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  const environment = parseWriteEnvironment(request);
  if (!environment) return NextResponse.json({ error: "Unknown configuration environment" }, { status: 400, headers: NO_STORE });
  const expectedUpdatedAt = parseEtag(request.headers.get("if-match"));
  if (expectedUpdatedAt === null) return NextResponse.json({ error: "If-Match is required. Read the current environment config first." }, { status: 428, headers: NO_STORE });
  const body = await readUpdateBody(request);
  if (body.kind === "too-large") return NextResponse.json({ error: "Request body exceeds 8192 bytes" }, { status: 413, headers: NO_STORE });
  if (body.kind === "invalid") return NextResponse.json({ error: "Expected known flag overrides and a reason" }, { status: 400, headers: NO_STORE });
  if (hasExpiredOverride(body.value.overrides)) return NextResponse.json({ error: "New flag overrides must expire in the future" }, { status: 400, headers: NO_STORE });
  return saveSeasonConfig(environment, expectedUpdatedAt, body.value);
}

async function saveSeasonConfig(environment: SeasonConfigEnvironment, expectedUpdatedAt: string, body: { overrides: NonNullable<ReturnType<typeof parseFeatureFlagOverrides>>; reason: string }): Promise<Response> {
  try {
    const repository = createSeasonConfigRepository(getKeyValueStore(getSantaSnapshotsBucket()));
    const state = await repository.replace(environment, expectedUpdatedAt, body.overrides, "admin", body.reason);
    if (!state) return NextResponse.json({ error: "Configuration changed. Reload before retrying." }, { status: 412, headers: NO_STORE });
    const effective = await readEffectiveSeasonConfig(environment, new Date());
    return NextResponse.json({ state, effective }, { headers: { ...NO_STORE, ETag: `"${state.updatedAt}"` } });
  } catch (error) {
    console.error("Admin season config write failed", error);
    if (error instanceof SeasonConfigCorruptError) return NextResponse.json({ error: "Stored season configuration is corrupt; refusing to overwrite it", corrupt: true }, { status: 409, headers: NO_STORE });
    return NextResponse.json({ error: "Unable to save season configuration" }, { status: 500, headers: NO_STORE });
  }
}

function parseWriteEnvironment(request: Request): SeasonConfigEnvironment | null {
  const environmentValue = new URL(request.url).searchParams.get("environment");
  return environmentValue === null ? getSeasonConfigEnvironment() : parseEnvironment(environmentValue);
}

function parseEnvironment(value: string): SeasonConfigEnvironment | null {
  return (SEASON_CONFIG_ENVIRONMENTS as readonly string[]).includes(value) ? value as SeasonConfigEnvironment : null;
}

function parseEtag(value: string | null): string | null {
  const match = value && /^"([^"]*)"$/.exec(value);
  return match ? match[1] ?? null : null;
}

function hasExpiredOverride(overrides: NonNullable<ReturnType<typeof parseFeatureFlagOverrides>>): boolean {
  const now = Date.now();
  return Object.values(overrides).some(override => override?.expiresAt !== null && override?.expiresAt !== undefined && Date.parse(override.expiresAt) <= now);
}
