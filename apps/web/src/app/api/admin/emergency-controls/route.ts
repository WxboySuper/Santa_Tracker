import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { readEmergencyControls, replaceEmergencyControls, type EmergencyControlValues } from "@/lib/emergency-controls";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  try {
    const state = await readEmergencyControls();
    return NextResponse.json(state, { headers: { ...NO_STORE, ETag: makeEtag(state.updatedAt) } });
  } catch (error) {
    console.error("Admin emergency controls read failed", error);
    return NextResponse.json({ error: "Unable to read emergency controls" }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  const expectedUpdatedAt = parseEtag(request.headers.get("if-match"));
  if (expectedUpdatedAt === null) return NextResponse.json({ error: "If-Match is required. Read current emergency controls first." }, { status: 428, headers: NO_STORE });
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: "Expected JSON emergency control values and a reason" }, { status: 400, headers: NO_STORE });
  try {
    const state = await replaceEmergencyControls(body.values, expectedUpdatedAt, "admin", body.reason);
    if (!state) return NextResponse.json({ error: "Emergency controls changed. Reload before retrying." }, { status: 412, headers: NO_STORE });
    return NextResponse.json(state, { headers: { ...NO_STORE, ETag: makeEtag(state.updatedAt) } });
  } catch (error) {
    console.error("Admin emergency controls write failed", error);
    return NextResponse.json({ error: "Unable to save emergency controls" }, { status: 500, headers: NO_STORE });
  }
}

async function readJson(request: Request): Promise<{ values: EmergencyControlValues; reason: string } | null> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 2_048) return null;
  let value: unknown;
  try { value = await request.json() as unknown; } catch { return null; }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "killedFeatures,noMap,reason,simplifiedTracker") return null;
  const killed = record.killedFeatures;
  if (typeof killed !== "object" || killed === null || Array.isArray(killed)) return null;
  const killedFeatures = killed as Record<string, unknown>;
  if (Object.keys(killedFeatures).sort().join(",") !== "soundscape,weather") return null;
  if (typeof record.noMap !== "boolean" || typeof record.simplifiedTracker !== "boolean") return null;
  if (typeof killedFeatures.weather !== "boolean" || typeof killedFeatures.soundscape !== "boolean") return null;
  if (typeof record.reason !== "string" || record.reason.trim().length === 0 || record.reason.length > 500) return null;
  return {
    values: {
      noMap: record.noMap,
      simplifiedTracker: record.simplifiedTracker,
      killedFeatures: { weather: killedFeatures.weather, soundscape: killedFeatures.soundscape },
    },
    reason: record.reason.trim(),
  };
}

function makeEtag(updatedAt: string): string { return `"${updatedAt}"`; }
function parseEtag(value: string | null): string | null {
  const match = value && /^"([^"]*)"$/.exec(value);
  return match ? match[1] ?? null : null;
}
