import { getSeasonConfig } from "@/lib/season-config-admin-read";
import { putSeasonConfig } from "@/lib/season-config-admin-write";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return getSeasonConfig(request);
}

export function PUT(request: Request) {
  return putSeasonConfig(request);
}
