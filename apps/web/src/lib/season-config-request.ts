import { parseFeatureFlagOverrides, SEASON_CONFIG_ENVIRONMENTS, type SeasonConfigEnvironment } from "./season-config";
import { readCappedJson } from "./admin-json";

export type UpdateBody = { overrides: NonNullable<ReturnType<typeof parseFeatureFlagOverrides>>; reason: string; repair: boolean };
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
  const result = await readCappedJson(request, 8_192);
  return result.ok ? { kind: "value", value: result.value } : result.status === 413 ? { kind: "too-large" } : { kind: "invalid" };
}

function parseUpdateValue(value: unknown): UpdateBodyResult {
  if (!isRecord(value)) return { kind: "invalid" };
  if (!hasValidUpdateKeys(value)) return { kind: "invalid" };
  const repair = parseRepairFlag(value);
  if (repair === null) return { kind: "invalid" };
  const overrides = parseFeatureFlagOverrides(value.overrides);
  const reason = parseReason(value.reason);
  return overrides && reason ? { kind: "body", value: { overrides, reason, repair } } : { kind: "invalid" };
}

function hasValidUpdateKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort().join(",");
  return keys === "overrides,reason" || keys === "overrides,reason,repair";
}

function parseRepairFlag(value: Record<string, unknown>): boolean | null {
  return !("repair" in value) || typeof value.repair === "boolean" ? value.repair === true : null;
}

function parseReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return reason.length > 0 && reason.length <= 500 ? reason : null;
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
