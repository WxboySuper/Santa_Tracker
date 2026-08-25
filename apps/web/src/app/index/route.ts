import { NextResponse } from "next/server";

// Flask had GET /index that rendered tracker.html (claimed redirect but didn't).
// Audit disposition: Archive as legacy alias. Provide real redirect.
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/tracker", request.url), 301);
}
