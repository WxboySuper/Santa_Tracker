import { publishedStopCards } from "@/lib/stop-cards";

// The cards ship with the build, so the response only changes on deploy; let the edge keep it for an hour.
export async function GET() {
  const includeDrafts = process.env.NODE_ENV !== "production";
  return Response.json(publishedStopCards(includeDrafts), {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
}
