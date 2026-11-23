import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { clearSeasonOverride, readSeasonOverrideState, writeSeasonOverride, MAX_SEASON_OVERRIDE_MS } from "@/lib/season-overrides";
import { effectiveSeasonMode, SEASON_MODES, seasonMode, type SeasonMode, type SeasonModeOverride } from "@/lib/season-mode";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_BODY_BYTES = 2_048;
const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return json({ error: auth.error ?? "Unauthorized" }, auth.status ?? 401);
  try {
    const state = await readSeasonOverrideState();
    const now = new Date();
    const effective = effectiveSeasonMode(now, seasonMode(now), state.override);
    return NextResponse.json({ ...state, effectiveMode: effective.mode, overrideStatus: effective.overrideStatus }, {
      headers: { ...NO_STORE, ETag: makeEtag(state.updatedAt) },
    });
  } catch (error: unknown) {
    console.error("Admin season mode read failed", error);
    return json({ error: "Unable to read season mode" }, 500);
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return json({ error: auth.error ?? "Unauthorized" }, auth.status ?? 401);
  const expectedUpdatedAt = parseEtag(request.headers.get("if-match"));
  if (expectedUpdatedAt === null) return json({ error: "If-Match is required. Read the current season mode before replacing it." }, 428);
  const parsed = await readJson(request);
  if (parsed.kind !== "body") return json({ error: parsed.kind === "too-large" ? "Request body too large" : "Invalid JSON" }, parsed.kind === "too-large" ? 413 : 400);
  if (!validSetBody(parsed.value)) return json({ error: "Expected a mode, UTC expiresAt, and non-empty reason" }, 400);

  const now = new Date();
  const expiry = Date.parse(parsed.value.expiresAt);
  const duration = expiry - now.getTime();
  if (duration <= 0) return json({ error: "expiresAt must be in the future" }, 400);
  if (duration > MAX_SEASON_OVERRIDE_MS) return json({ error: "Season overrides may last at most 48 hours" }, 400);
  const override: SeasonModeOverride = {
    mode: parsed.value.mode,
    setAt: now.toISOString(),
    expiresAt: new Date(expiry).toISOString(),
    reason: parsed.value.reason.trim(),
    setBy: "admin",
  };
  return save(Promise.resolve().then(() => writeSeasonOverride(override, expectedUpdatedAt, "admin")), "set");
}

export async function DELETE(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return json({ error: auth.error ?? "Unauthorized" }, auth.status ?? 401);
  const expectedUpdatedAt = parseEtag(request.headers.get("if-match"));
  if (expectedUpdatedAt === null) return json({ error: "If-Match is required. Read the current season mode before clearing it." }, 428);
  return save(Promise.resolve().then(() => clearSeasonOverride(expectedUpdatedAt, "admin")), "clear");
}

async function save(pending: Promise<Awaited<ReturnType<typeof writeSeasonOverride>>>, action: "set" | "clear"): Promise<NextResponse> {
  try {
    const state = await pending;
    if (!state) return json({ error: "Season mode changed. Reload the current state before retrying." }, 412);
    return NextResponse.json(state, { headers: { ...NO_STORE, ETag: makeEtag(state.updatedAt) } });
  } catch (error: unknown) {
    console.error(`Admin season mode ${action} failed`, error);
    return json({ error: "Unable to save season mode" }, 500);
  }
}

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function makeEtag(updatedAt: string): string { return `"${updatedAt}"`; }
function parseEtag(value: string | null): string | null {
  const match = value && /^"([^"]*)"$/.exec(value);
  return match ? match[1] ?? null : null;
}

type ParsedRequest = { mode: SeasonMode; expiresAt: string; reason: string };
function validSetBody(value: unknown): value is ParsedRequest {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "expiresAt,mode,reason") return false;
  return typeof value.mode === "string" && (SEASON_MODES as readonly string[]).includes(value.mode)
    && typeof value.expiresAt === "string" && isTimestamp(value.expiresAt)
    && typeof value.reason === "string" && value.reason.trim().length > 0 && value.reason.length <= 500;
}

function isTimestamp(value: string): boolean {
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return false;
  const date = new Date(value);
  const fraction = match[2] ? `.${match[2].padEnd(3, "0")}` : ".000";
  return !Number.isNaN(date.getTime()) && date.toISOString() === `${match[1]}${fraction}Z`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(request: Request): Promise<{ kind: "body"; value: unknown } | { kind: "too-large" } | { kind: "invalid" }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return { kind: "invalid" };
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return { kind: "too-large" };
  if (!request.body) return parseJson(new Uint8Array());
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        return { kind: "too-large" };
      }
      chunks.push(chunk.value);
    }
  } catch {
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return parseJson(bytes);
}

function parseJson(bytes: Uint8Array): { kind: "body"; value: unknown } | { kind: "invalid" } {
  try { return { kind: "body", value: JSON.parse(new TextDecoder().decode(bytes)) as unknown }; }
  catch { return { kind: "invalid" }; }
}
