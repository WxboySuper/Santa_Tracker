import { notFound } from "next/navigation";
import { canViewFeature } from "@/lib/access";
import { isAdventEnabled } from "@/lib/config";
import TrackerMap from "./tracker-map";
import { getRequestLocale } from "@/lib/request-locale";

// Visibility depends on the clock and the admin session, so this page is never prerendered.
export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  if (!(await canViewFeature("tracker"))) notFound();
  const adventVisible = isAdventEnabled() && (await canViewFeature("advent"));
  return <TrackerMap adventEnabled={adventVisible} locale={await getRequestLocale()} />;
}
