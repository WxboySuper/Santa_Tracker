import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdminAuth, verifyAdminToken } from "./auth";
import { isFeatureOpen, resolveAccess, type FeatureAccess, type SeasonFeature } from "./season";
import { currentTime } from "./clock";
import { readFeatureFlags } from "./feature-flags";

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

async function publiclyOpen(feature: SeasonFeature, now: Date): Promise<boolean> {
  const flags = await readFeatureFlags();
  return (overrideOpen() || isFeatureOpen(feature, now)) && !flags.hidden[feature];
}

/**
 * A hostile or corrupt credential must never turn a closed gate into an error: a 500 instead of the
 * 404 every other visitor gets would reveal that the hidden route exists. Any failure to establish
 * an admin session therefore means "not an admin".
 */
async function asAdmin(check: () => Promise<boolean>): Promise<boolean> {
  try {
    return await check();
  } catch {
    return false;
  }
}

/** Whether this page request carries a valid admin session cookie. */
function isAdminSession(): Promise<boolean> {
  return asAdmin(async () => {
    const token = (await cookies()).get("admin_token")?.value;
    return token ? verifyAdminToken(token) : false;
  });
}

/** Page-side gate for work in progress: only a logged-in admin may preview it. */
export async function canPreviewDesign(): Promise<boolean> {
  return overrideOpen() || (await isAdminSession());
}

/** Page-side gate: true when the visitor may see `feature` now. */
export async function canViewFeature(feature: SeasonFeature, now: Date = currentTime()): Promise<boolean> {
  if (await publiclyOpen(feature, now)) return true;
  return isAdminSession();
}

/** API-side decision, taken from the request's own credentials (cookie or bearer token). */
export async function featureAccess(feature: SeasonFeature, request: Request, now: Date = currentTime()): Promise<FeatureAccess> {
  if (await publiclyOpen(feature, now)) return "open";
  const admin = await asAdmin(async () => (await requireAdminAuth(request)).ok);
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
