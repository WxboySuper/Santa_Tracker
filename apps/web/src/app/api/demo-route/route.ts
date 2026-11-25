import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DRAFT_ROUTE = "docs/planning/route-2026-draft/route.json";
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/**
 * Development only: serves the draft route from the repository so the route demo can fly it before it is
 * published. Production returns 404 so a draft route can never leak to visitors.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const [{ readFile }, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
    const file = path.resolve(process.cwd(), "..", "..", DRAFT_ROUTE);
    const text = await readFile(file, "utf8");
    const route = JSON.parse(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text) as { route_nodes?: unknown };
    return NextResponse.json({ route_nodes: route.route_nodes ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("Demo route error", error);
    return NextResponse.json({ error: "Draft route not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
