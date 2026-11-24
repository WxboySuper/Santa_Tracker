import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/auth";
import { clearSeasonOverride, readSeasonOverrideState, writeSeasonOverride, MAX_SEASON_OVERRIDE_MS } from "@/lib/season-overrides";
import { effectiveSeasonMode, SEASON_MODES, seasonMode, type SeasonModeOverride } from "@/lib/season-mode";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_BODY_BYTES = 2_048;
const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;
const setRequestSchema = z.object({
  mode: z.enum(SEASON_MODES),
  expiresAt: z.string().regex(ISO_DATE_TIME).refine(isCanonicalTimestamp),
  reason: z.string().trim().min(1).max(500),
}).strict();

type AccessResult = { ok: true; expectedUpdatedAt: string } | { ok: false; response: NextResponse };
type BodyResult = { kind: "body"; value: unknown } | { kind: "too-large" } | { kind: "invalid" };
type ByteResult = { kind: "bytes"; value: Uint8Array } | { kind: "too-large" } | { kind: "invalid" };

export async function GET(request: Request) {
  const authResponse = await authorizationError(request);
  if (authResponse) return authResponse;
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
  const access = await authorizeWithEtag(request, "Read the current season mode before replacing it.");
  if (!access.ok) return access.response;
  return setOverride(request, access.expectedUpdatedAt);
}

export async function DELETE(request: Request) {
  const access = await authorizeWithEtag(request, "Read the current season mode before clearing it.");
  if (!access.ok) return access.response;
  return saveState(clearSeasonOverride(access.expectedUpdatedAt, "admin"), "clear");
}

async function authorizationError(request: Request): Promise<NextResponse | null> {
  const auth = await requireAdminAuth(request);
  return auth.ok ? null : json({ error: auth.error ?? "Unauthorized" }, auth.status ?? 401);
}

async function authorizeWithEtag(request: Request, instruction: string): Promise<AccessResult> {
  const authResponse = await authorizationError(request);
  if (authResponse) return { ok: false, response: authResponse };
  const expectedUpdatedAt = parseEtag(request.headers.get("if-match"));
  if (expectedUpdatedAt === null) {
    return { ok: false, response: json({ error: `If-Match is required. ${instruction}` }, 428) };
  }
  return { ok: true, expectedUpdatedAt };
}

async function setOverride(request: Request, expectedUpdatedAt: string): Promise<NextResponse> {
  const body = await readJson(request);
  if (body.kind !== "body") return bodyError(body);
  const parsed = setRequestSchema.safeParse(body.value);
  if (!parsed.success) return json({ error: "Expected a mode, UTC expiresAt, and non-empty reason" }, 400);
  const now = new Date();
  const override = createOverride(parsed.data, now);
  if ("error" in override) return json({ error: override.error }, 400);
  return saveState(Promise.resolve().then(() => writeSeasonOverride(override.value, expectedUpdatedAt, "admin")), "set");
}

function createOverride(input: z.infer<typeof setRequestSchema>, now: Date): { value: SeasonModeOverride } | { error: string } {
  const expiry = Date.parse(input.expiresAt);
  const duration = expiry - now.getTime();
  if (duration <= 0) return { error: "expiresAt must be in the future" };
  if (duration > MAX_SEASON_OVERRIDE_MS) return { error: "Season overrides may last at most 48 hours" };
  return {
    value: { mode: input.mode, setAt: now.toISOString(), expiresAt: new Date(expiry).toISOString(), reason: input.reason, setBy: "admin" },
  };
}

async function saveState(pending: Promise<Awaited<ReturnType<typeof writeSeasonOverride>>>, action: "set" | "clear"): Promise<NextResponse> {
  try {
    const state = await pending;
    if (!state) return json({ error: "Season mode changed. Reload the current state before retrying." }, 412);
    return NextResponse.json(state, { headers: { ...NO_STORE, ETag: makeEtag(state.updatedAt) } });
  } catch (error: unknown) {
    console.error(`Admin season mode ${action} failed`, error);
    return json({ error: "Unable to save season mode" }, 500);
  }
}

function bodyError(body: Exclude<BodyResult, { kind: "body" }>): NextResponse {
  return json({ error: body.kind === "too-large" ? "Request body too large" : "Invalid JSON" }, body.kind === "too-large" ? 413 : 400);
}

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function makeEtag(updatedAt: string): string { return `"${updatedAt}"`; }
function parseEtag(value: string | null): string | null {
  const match = value && /^"([^"]*)"$/.exec(value);
  return match ? match[1] ?? null : null;
}

function isCanonicalTimestamp(value: string): boolean {
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return false;
  const date = new Date(value);
  const fraction = match[2] ? `.${match[2].padEnd(3, "0")}` : ".000";
  return !Number.isNaN(date.getTime()) && date.toISOString() === `${match[1]}${fraction}Z`;
}

async function readJson(request: Request): Promise<BodyResult> {
  const headerError = validateJsonHeaders(request);
  if (headerError) return headerError;
  const bytes = await readCappedBody(request.body);
  if (bytes.kind !== "bytes") return bytes;
  try { return { kind: "body", value: JSON.parse(new TextDecoder().decode(bytes.value)) as unknown }; }
  catch { return { kind: "invalid" }; }
}

function validateJsonHeaders(request: Request): Exclude<BodyResult, { kind: "body" }> | null {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return { kind: "invalid" };
  const length = Number(request.headers.get("content-length"));
  return Number.isFinite(length) && length > MAX_BODY_BYTES ? { kind: "too-large" } : null;
}

async function readCappedBody(body: ReadableStream<Uint8Array> | null): Promise<ByteResult> {
  if (!body) return { kind: "bytes", value: new Uint8Array() };
  const reader = body.getReader();
  try { return await collectChunks(reader); }
  catch { return { kind: "invalid" }; }
  finally { reader.releaseLock(); }
}

async function collectChunks(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<ByteResult> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) return { kind: "bytes", value: joinChunks(chunks, total) };
    total += chunk.value.byteLength;
    if (total > MAX_BODY_BYTES) {
      void reader.cancel().catch(() => undefined);
      return { kind: "too-large" };
    }
    chunks.push(chunk.value);
  }
}

function joinChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
