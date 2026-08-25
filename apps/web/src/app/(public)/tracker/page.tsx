import { isAdventEnabled } from "@/lib/config";
import TrackerMap from "./tracker-map";

export default function TrackerPage() {
  return <TrackerMap adventEnabled={isAdventEnabled()} />;
}
