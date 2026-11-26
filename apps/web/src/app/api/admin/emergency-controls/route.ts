import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { readEmergencyControls, replaceEmergencyControls, type EmergencyControlValues } from "@/lib/emergency-controls";
import { readCappedJson } from "@/lib/admin-json";

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
  if (body.kind === "too-large") return NextResponse.json({ error: "Request body exceeds 2048 bytes" }, { status: 413, headers: NO_STORE });
  if (body.kind === "invalid") return NextResponse.json({ error: "Expected JSON emergency control values and a reason" }, { status: 400, headers: NO_STORE });
  try {
    const state = await replaceEmergencyControls(body.value.values, expectedUpdatedAt, "admin", body.value.reason);
    if (!state) return NextResponse.json({ error: "Emergency controls changed. Reload before retrying." }, { status: 412, headers: NO_STORE });
    return NextResponse.json(state, { headers: { ...NO_STORE, ETag: makeEtag(state.updatedAt) } });
  } catch (error) {
    console.error("Admin emergency controls write failed", error);
    return NextResponse.json({ error: "Unable to save emergency controls" }, { status: 500, headers: NO_STORE });
  }
}

type JsonResult = { kind: "body"; value: { values: EmergencyControlValues; reason: string } } | { kind: "invalid" } | { kind: "too-large" };
const MAX_BODY_BYTES = 2_048;

async function readJson(request: Request): Promise<JsonResult> {
  const result = await readCappedJson(request, MAX_BODY_BYTES);
  if (!result.ok) return result.status === 413 ? { kind: "too-large" } : { kind: "invalid" };
  const value = parseEmergencyPayload(result.value);
  return value ? { kind: "body", value } : { kind: "invalid" };
}

function parseEmergencyPayload(value: unknown): { values: EmergencyControlValues; reason: string } | null {
  const record = parseEmergencyRecord(value);
  if (!record) return null;
  const values = parseControlValues(record);
  const reason = parseReason(record.reason);
  return values && reason ? { values, reason } : null;
}

function parseEmergencyRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return hasExactKeys(value, "killedFeatures,noMap,reason,simplifiedTracker") ? value : null;
}

function parseControlValues(value: Record<string, unknown>): EmergencyControlValues | null {
  if (typeof value.noMap !== "boolean" || typeof value.simplifiedTracker !== "boolean") return null;
  const killedFeatures = parseKilledFeatures(value.killedFeatures);
  if (!killedFeatures) return null;
  return { noMap: value.noMap, simplifiedTracker: value.simplifiedTracker, killedFeatures };
}

function parseReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.trim().length === 0) return null;
  if (value.length > 500) return null;
  return value.trim();
}

function parseKilledFeatures(value: unknown): EmergencyControlValues["killedFeatures"] | null {
  if (!isRecord(value) || !hasExactKeys(value, "soundscape,weather")) return null;
  if (typeof value.weather !== "boolean" || typeof value.soundscape !== "boolean") return null;
  return { weather: value.weather, soundscape: value.soundscape };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string): boolean {
  return Object.keys(value).sort().join(",") === keys;
}

function makeEtag(updatedAt: string): string { return `"${updatedAt}"`; }
function parseEtag(value: string | null): string | null {
  const match = value && /^"([^"]*)"$/.exec(value);
  return match ? match[1] ?? null : null;
}
