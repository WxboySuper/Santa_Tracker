import { isAdventEnabled } from "@/lib/config";
import TrackerMap from "./tracker-map";
import { getRequestLocale } from "@/lib/request-locale";

export default async function TrackerPage() {
  return <TrackerMap adventEnabled={isAdventEnabled()} locale={await getRequestLocale()} />;
}
