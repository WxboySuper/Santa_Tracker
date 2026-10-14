import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/auth";
import { isAdventEnabled } from "@/lib/config";
import { previewAdminAdventDays } from "@/lib/admin-advent";
import { ADVENT_NO_STORE_HEADERS } from "@/lib/advent-http";

export const dynamic = "force-dynamic";
const ISO_EXPLICIT_ZONE_DATE_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/;

export async function GET(req: NextRequest) {
  if (!isAdventEnabled()) return jsonError("Not found", 404);
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return jsonError(auth.error ?? "Unauthorized", auth.status ?? 401);
  const rawTime = req.nextUrl.searchParams.get("at");
  if (rawTime === null) return jsonError("The 'at' query parameter is required", 400);
  const parsedTime = parsePreviewTime(rawTime);
  if (parsedTime === null) {
    return jsonError("Invalid 'at'. Expected an ISO 8601 date-time with Z or a numeric UTC offset, e.g. 2026-12-05T00:00:00Z or 2026-12-05T02:00:00+02:00", 400);
  }
  try {
    const result = await previewAdminAdventDays(parsedTime);
    return NextResponse.json(result.body, { status: result.status, headers: ADVENT_NO_STORE_HEADERS });
  } catch (error: unknown) {
    console.error("Admin advent preview error", error);
    return jsonError("Internal server error", 500);
  }
}

function parsePreviewTime(value: string): Date | null {
  const components = previewTimeComponents(value);
  if (!components) return null;
  const parsedTime = new Date(value);
  return matchesLocalDateTime(parsedTime, components.localDateTime, components.zone) ? parsedTime : null;
}

function previewTimeComponents(value: string): { localDateTime: string; zone: string } | null {
  if (value.endsWith("-00:00")) return null;
  const match = ISO_EXPLICIT_ZONE_DATE_TIME.exec(value);
  if (!match) return null;
  const localDateTime = match[1];
  const zone = match[2];
  if (!localDateTime || !zone) return null;
  return { localDateTime, zone };
}

function matchesLocalDateTime(parsedTime: Date, localDateTime: string, zone: string): boolean {
  if (Number.isNaN(parsedTime.getTime())) return false;
  const offsetMinutes = parseZoneOffsetMinutes(zone);
  if (offsetMinutes === null) return false;
  const normalizedLocalTime = new Date(parsedTime.getTime() + offsetMinutes * 60_000);
  return !Number.isNaN(normalizedLocalTime.getTime()) && normalizedLocalTime.toISOString().slice(0, 19) === localDateTime;
}

function parseZoneOffsetMinutes(zone: string): number | null {
  if (zone === "Z") return 0;
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(zone);
  if (!match) return null;
  const direction = match[1] === "+" ? 1 : -1;
  return direction * (Number(match[2]) * 60 + Number(match[3]));
}

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status, headers: ADVENT_NO_STORE_HEADERS });
}
