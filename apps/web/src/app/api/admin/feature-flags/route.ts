import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { readFeatureFlags, writeFeatureFlags } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_BODY_BYTES = 1024;

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  return NextResponse.json(await readFeatureFlags(), { headers: NO_STORE });
}

export async function PUT(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: auth.status ?? 401, headers: NO_STORE });
  return saveFeatureFlags(request);
}

async function saveFeatureFlags(request: Request): Promise<NextResponse> {
  const parsed = await readFlagsBody(request);
  if (parsed.kind === "error") return parsed.response;
  if (!validRequestBody(parsed.value)) {
    return NextResponse.json({ error: "Expected version 1 and boolean tracker and advent flags" }, { status: 400, headers: NO_STORE });
  }
  return writeFlags(parsed.value.hidden);
}

async function readFlagsBody(request: Request): Promise<{ kind: "body"; value: unknown } | { kind: "error"; response: NextResponse }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { kind: "error", response: NextResponse.json({ error: "Content-Type must be application/json" }, { status: 400, headers: NO_STORE }) };
  }
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return { kind: "error", response: NextResponse.json({ error: "Request body too large" }, { status: 413, headers: NO_STORE }) };
  }
  const parsed = await readCappedJson(request);
  if (parsed.kind === "body") return parsed;
  return parsed.kind === "too-large"
    ? { kind: "error", response: NextResponse.json({ error: "Request body too large" }, { status: 413, headers: NO_STORE }) }
    : { kind: "error", response: NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE }) };
}

async function writeFlags(hidden: { tracker: boolean; advent: boolean }): Promise<NextResponse> {
  try {
    const result = await writeFeatureFlags(hidden, new Date().toISOString());
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error: unknown) {
    console.error("Admin feature flags write failed", error);
    return NextResponse.json({ error: "Unable to save feature flags" }, { status: 500, headers: NO_STORE });
  }
}

async function readCappedJson(request: Request): Promise<{ kind: "body"; value: unknown } | { kind: "too-large" } | { kind: "invalid" }> {
  if (!request.body) return parseJson(new Uint8Array());
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
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
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return parseJson(bytes);
}

function parseJson(bytes: Uint8Array): { kind: "body"; value: unknown } | { kind: "invalid" } {
  try {
    return { kind: "body", value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { kind: "invalid" };
  }
}

function validRequestBody(value: unknown): value is { version: 1; hidden: { tracker: boolean; advent: boolean } } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "hidden,version" || record.version !== 1) return false;
  if (typeof record.hidden !== "object" || record.hidden === null || Array.isArray(record.hidden)) return false;
  const hidden = record.hidden as Record<string, unknown>;
  return Object.keys(hidden).sort().join(",") === "advent,tracker" && typeof hidden.tracker === "boolean" && typeof hidden.advent === "boolean";
}
