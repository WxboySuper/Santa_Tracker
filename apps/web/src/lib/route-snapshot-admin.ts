import { withWriteLock } from "./file-lock";
import { validateRouteSnapshot, type RouteSnapshotValidationReport } from "./route-snapshot-release";
import type { VersionedSnapshotStore, SnapshotVersion, ActivePointer } from "./storage/types";
import { DATASET_SANTA_ROUTE } from "./storage/types";
import { NextResponse } from "next/server";

export type SnapshotOperationResult =
  | { kind: "conflict" }
  | { kind: "missing" }
  | { kind: "invalid"; report: RouteSnapshotValidationReport }
  | { kind: "no-prior" }
  | { kind: "validated"; report: RouteSnapshotValidationReport }
  | { kind: "activated"; active: ActivePointer | null; report: RouteSnapshotValidationReport }
  | { kind: "rolled-back"; snapshot: SnapshotVersion; active: ActivePointer | null; report: RouteSnapshotValidationReport };
type ValidationResult = { kind: "missing" } | { kind: "validated"; report: RouteSnapshotValidationReport };
type ActivationResult = Extract<SnapshotOperationResult, { kind: "conflict" | "missing" | "invalid" | "activated" }>;
type RollbackResult = Extract<SnapshotOperationResult, { kind: "conflict" | "missing" | "invalid" | "no-prior" | "rolled-back" }>;

export function isSafeVersionId({ value }: { value: string }): boolean {
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/.test(value) && !value.includes("..");
}

export async function readSnapshotVersionId(request: Request): Promise<string | null> {
  if (!isJsonRequest(request)) return null;
  const value = await request.json().catch(() => null) as unknown;
  return snapshotVersionId(value);
}

export async function readSnapshotReason(request: Request): Promise<string | null> {
  if (!isJsonRequest(request)) return null;
  const value = await request.json().catch(() => null) as unknown;
  if (!isRecord(value) || typeof value.reason !== "string") return null;
  const reason = value.reason.trim();
  return reason.length > 0 && reason.length <= 500 ? reason : null;
}

export async function validateSnapshotVersion(store: VersionedSnapshotStore, versionId: string): Promise<ValidationResult> {
  const body = await store.readVersion(DATASET_SANTA_ROUTE, versionId);
  if (body === null) return { kind: "missing" };
  return { kind: "validated", report: await validateRouteSnapshot(body) };
}

export async function activateSnapshot(input: {
  store: VersionedSnapshotStore;
  versionId: string;
  expectedUpdatedAt: string;
  reason: string;
}): Promise<ActivationResult> {
  const { store, versionId, expectedUpdatedAt, reason } = input;
  return withWriteLock(async () => {
    if (!(await matchesActivePointer({ store, expectedUpdatedAt }))) return { kind: "conflict" };
    const validation = await validateSnapshotVersion(store, versionId);
    if (validation.kind !== "validated") return validation;
    if (!validation.report.valid) return { kind: "invalid", report: validation.report };
    await store.activateVersion(DATASET_SANTA_ROUTE, versionId, {
      actor: "admin",
      reason,
      checksum: validation.report.checksum,
    });
    return { kind: "activated", active: await store.readActiveVersion(DATASET_SANTA_ROUTE), report: validation.report };
  });
}

export async function rollbackSnapshot(input: {
  store: VersionedSnapshotStore;
  expectedUpdatedAt: string;
  reason: string;
}): Promise<RollbackResult> {
  const { store, expectedUpdatedAt, reason } = input;
  return withWriteLock(async () => {
    const active = await store.readActiveVersion(DATASET_SANTA_ROUTE);
    if (!active || active.updatedAt !== expectedUpdatedAt) return { kind: "conflict" };
    const versions = await store.listVersions(DATASET_SANTA_ROUTE);
    const activeIndex = versions.findIndex(version => version.versionId === active.versionId);
    if (activeIndex < 0) return { kind: "missing" };
    const prior = versions[activeIndex + 1];
    if (!prior) return { kind: "no-prior" };
    const validation = await validateSnapshotVersion(store, prior.versionId);
    if (validation.kind !== "validated") return validation;
    if (!validation.report.valid) return { kind: "invalid", report: validation.report };
    const snapshot = await store.rollback(DATASET_SANTA_ROUTE, {
      actor: "admin",
      reason,
      checksum: validation.report.checksum,
    }, prior.versionId);
    return { kind: "rolled-back", snapshot, active: await store.readActiveVersion(DATASET_SANTA_ROUTE), report: validation.report };
  });
}

export function activationResponse(result: ActivationResult): NextResponse {
  if (result.kind === "conflict") return response({ error: "Active route changed. Reload snapshots before retrying." }, 412);
  if (result.kind === "missing") return response({ error: "Route snapshot not found" }, 404);
  if (result.kind === "invalid") return response({ error: "Route snapshot failed validation", report: result.report }, 422);
  return NextResponse.json({ active: result.active, report: result.report }, {
    headers: { ...NO_STORE, ETag: `"${result.active?.updatedAt ?? ""}"` },
  });
}

export function rollbackResponse(result: RollbackResult): NextResponse {
  if (result.kind === "conflict") return response({ error: "Active route changed. Reload snapshots before retrying." }, 412);
  if (result.kind === "no-prior") return response({ error: "No prior route snapshot is available" }, 409);
  if (result.kind === "missing") return response({ error: "Active or prior route snapshot not found" }, 404);
  if (result.kind === "invalid") return response({ error: "Prior route snapshot failed validation", report: result.report }, 422);
  return NextResponse.json({ snapshot: result.snapshot, active: result.active, report: result.report }, {
    headers: { ...NO_STORE, ETag: `"${result.active?.updatedAt ?? ""}"` },
  });
}

const NO_STORE = { "Cache-Control": "private, no-store" };
function response(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function matchesActivePointer({ store, expectedUpdatedAt }: { store: VersionedSnapshotStore; expectedUpdatedAt: string }): Promise<boolean> {
  const active = await store.readActiveVersion(DATASET_SANTA_ROUTE);
  return (active?.updatedAt ?? "") === expectedUpdatedAt;
}

function isJsonRequest(request: Request): boolean {
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") === true;
}

function snapshotVersionId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value.versionId !== "string") return null;
  return isSafeVersionId({ value: value.versionId }) ? value.versionId : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
