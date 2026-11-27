import { NextResponse } from "next/server";
import { requireAdminAuth } from "./auth";
import { getKeyValueStore } from "./storage";
import { getSantaSnapshotsBucket } from "./cloudflare-bindings";
import { createSeasonConfigRepository, getSeasonConfigEnvironment, readEffectiveSeasonConfig, SEASON_CONFIG_ENVIRONMENTS, type SeasonConfigEnvironment } from "./season-config";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function getSeasonConfig(request: Request): Promise<Response> {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  const query = parseReadQuery(new URL(request.url));
  if (!query) return NextResponse.json({ error: "Unknown configuration environment or invalid timestamp" }, { status: 400, headers: NO_STORE });
  return readSeasonConfig(query.environment, query.at);
}

async function readSeasonConfig(environment: SeasonConfigEnvironment, at: Date): Promise<Response> {
  try {
    const repository = createSeasonConfigRepository(getKeyValueStore(getSantaSnapshotsBucket()));
    const { state, corrupt: storedCorrupt, etag } = await repository.readWithStatus(environment);
    const effective = await readEffectiveSeasonConfig(environment, at, undefined, repository);
    const corrupt = storedCorrupt || effective.corrupt;
    if (corrupt) console.error("Stored admin season configuration is corrupt", { environment });
    return NextResponse.json({ state, effective, corrupt }, { headers: { ...NO_STORE, ETag: etag } });
  } catch (error) {
    console.error("Admin season config read failed", error);
    return NextResponse.json({ error: "Unable to read season configuration" }, { status: 500, headers: NO_STORE });
  }
}

function parseReadQuery(url: URL): { environment: SeasonConfigEnvironment; at: Date } | null {
  const environment = parseEnvironment(url.searchParams.get("environment"));
  const at = parseTimestamp(url.searchParams.get("at"));
  return environment && at ? { environment, at } : null;
}

function parseEnvironment(value: string | null): SeasonConfigEnvironment | null {
  if (value === null) return getSeasonConfigEnvironment();
  return (SEASON_CONFIG_ENVIRONMENTS as readonly string[]).includes(value) ? value as SeasonConfigEnvironment : null;
}

function parseTimestamp(value: string | null): Date | null {
  if (value === null) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : date;
}
