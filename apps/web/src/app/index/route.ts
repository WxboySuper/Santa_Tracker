import { NextResponse } from "next/server";

// Flask had GET /index that rendered tracker.html (claimed redirect but didn't).
// Audit disposition: Archive as legacy alias. Provide real redirect.
export function GET() {
  return NextResponse.redirect(new URL("/tracker", process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"), 301);
}
