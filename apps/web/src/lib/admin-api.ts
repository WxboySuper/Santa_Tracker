import { NextResponse } from "next/server";

export interface AdminApiResult {
  status: number;
  body: Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readJsonBody(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

export function respondWith(result: AdminApiResult): NextResponse {
  return NextResponse.json(result.body, { status: result.status });
}

export function notFoundAwareError(error: unknown, notFoundBody: Record<string, unknown>): AdminApiResult {
  if (isNotFoundError(error)) {
    return { status: 404, body: notFoundBody };
  }
  console.error(error);
  return { status: 500, body: { error: "Internal server error" } };
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ((error as NodeJS.ErrnoException & { cause?: unknown }).cause === "ENOENT") return true;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
  return error.message.toLowerCase().includes("not found");
}

export function badRequest(error: string): AdminApiResult {
  return { status: 400, body: { error } };
}
