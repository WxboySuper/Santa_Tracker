import { previewSeasonConfig } from "@/lib/season-config-preview";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return previewSeasonConfig(request);
}
