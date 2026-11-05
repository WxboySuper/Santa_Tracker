import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdminAuth, verifyAdminToken } from "./auth";
import { isFeatureOpen, resolveAccess, type FeatureAccess, type SeasonFeature } from "./season";

/**
 * Season gating on the server. A feature outside its public window (see `season.ts`) is hidden
 * from visitors but stays visible to a logged-in admin so the owner can preview.
 *
 * `SEASON_OVERRIDE=open` opens everything; it is meant for local development and preview
 * deployments and is not set in production.
 */

const NO_STORE = "private, no-store";

function overrideOpen(): boolean {
  return process.env.SEASON_OVERRIDE === "open";
}

function publiclyOpen(feature: SeasonFeature, now: Date): boolean {
  return overrideOpen() || isFeatureOpen(feature, now);
}

/** Whether this page request carries a valid admin session cookie. */
async function isAdminSession(): Promise<boolean> {
  const token = (await cookies()).get("admin_token")?.value;
  return token ? verifyAdminToken(token) : false;
}

/** Page-side gate: true when the visitor may see `feature` now. */
export async function canViewFeature(feature: SeasonFeature, now: Date = new Date()): Promise<boolean> {
  if (publiclyOpen(feature, now)) return true;
  return isAdminSession();
}

/** API-side decision, taken from the request's own credentials (cookie or bearer token). */
export async function featureAccess(feature: SeasonFeature, request: Request, now: Date = new Date()): Promise<FeatureAccess> {
  if (publiclyOpen(feature, now)) return "open";
  const admin = (await requireAdminAuth(request)).ok;
  return resolveAccess(false, admin);
}

/** 404 that must never be cached, so it cannot outlive the window opening. */
export function closedResponse(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": NO_STORE } });
}

/**
 * Wrap a route handler so it answers 404 to visitors while `feature` is closed.
 * Responses produced for an admin through a closed gate must not be cached; the wrapped handler is
 * responsible for its own cache headers when the feature is open.
 */
export function gatedFeature<Context>(
  feature: SeasonFeature,
  handler: (request: Request, context: Context) => Promise<Response> | Response,
): (request: Request, context: Context) => Promise<Response> {
  return async (request, context) => {
    const access = await featureAccess(feature, request);
    if (access === "closed") return closedResponse();
    const response = await handler(request, context);
    if (access === "admin") response.headers.set("Cache-Control", NO_STORE);
    return response;
  };
}
