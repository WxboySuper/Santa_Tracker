import { parseFeatureFlagOverrides, SEASON_CONFIG_ENVIRONMENTS, type SeasonConfigEnvironment } from "./season-config";
import { readCappedBody } from "./read-capped-body";

export type UpdateBody = { overrides: NonNullable<ReturnType<typeof parseFeatureFlagOverrides>>; reason: string };
export type UpdateBodyResult = { kind: "body"; value: UpdateBody } | { kind: "invalid" } | { kind: "too-large" };
export type PreviewBody = {
  environment: SeasonConfigEnvironment;
  at: Date;
  overrides: NonNullable<ReturnType<typeof parseFeatureFlagOverrides>>;
};
export type PreviewBodyResult = { kind: "body"; value: PreviewBody } | { kind: "invalid" } | { kind: "too-large" };

type JsonBodyResult = { kind: "value"; value: unknown } | { kind: "invalid" } | { kind: "too-large" };

export async function readUpdateBody(request: Request): Promise<UpdateBodyResult> {
  const json = await readJsonBody(request);
  if (json.kind !== "value") return json;
  return parseUpdateValue(json.value);
}

export async function readPreviewBody(request: Request): Promise<PreviewBodyResult> {
  const json = await readJsonBody(request);
  if (json.kind !== "value") return json;
  return parsePreviewValue(json.value);
}

async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return { kind: "invalid" };
  const bytes = await readCappedBody(request.body, 8_192);
  if (bytes.kind !== "bytes") return bytes;
  try { return { kind: "value", value: JSON.parse(new TextDecoder().decode(bytes.value)) as unknown }; }
  catch { return { kind: "invalid" }; }
}

function parseUpdateValue(value: unknown): UpdateBodyResult {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "overrides,reason") return { kind: "invalid" };
  const overrides = parseFeatureFlagOverrides(value.overrides);
  if (!overrides || typeof value.reason !== "string") return { kind: "invalid" };
  const reason = value.reason.trim();
  return reason.length > 0 && reason.length <= 500 ? { kind: "body", value: { overrides, reason } } : { kind: "invalid" };
}

function parsePreviewValue(value: unknown): PreviewBodyResult {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "at,environment,overrides") return { kind: "invalid" };
  const environment = parseEnvironment(value.environment);
  const at = parseTimestamp(value.at);
  const overrides = parseFeatureFlagOverrides(value.overrides);
  return environment && at && overrides ? { kind: "body", value: { environment, at, overrides } } : { kind: "invalid" };
}

function parseEnvironment(value: unknown): SeasonConfigEnvironment | null {
  return typeof value === "string" && (SEASON_CONFIG_ENVIRONMENTS as readonly string[]).includes(value)
    ? value as SeasonConfigEnvironment
    : null;
}

function parseTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
