import type { TrackerMapAdapter } from "@/lib/tracker-map-adapter";
import type { InteractiveMapMode, MapRuntime, StartResult } from "./tracker-map-types";
import type { StyleLoadError } from "@/lib/openlayers-tracker-map";

export async function startAdapter(runtime: Omit<MapRuntime, "mode"> & { mode: InteractiveMapMode }, isCancelled: () => boolean): Promise<StartResult> {
  let instance: TrackerMapAdapter | undefined;
  let styleLoadError: typeof StyleLoadError | undefined;
  try {
    const module = await import("@/lib/openlayers-tracker-map");
    styleLoadError = module.StyleLoadError;
    if (isCancelled()) return {};
    const element = runtime.element.current;
    if (!element) return { failure: "initFailed" };
    instance = new module.OpenLayersTrackerMap(runtime.mode, () => runtime.dispatch("rasterFailed"), runtime.stopFollowing);
    runtime.adapter.current = instance;
    instance.setRoute(runtime.nodes);
    if (runtime.position) instance.setSantaPosition(runtime.position);
    await instance.mount(element);
    if (isCancelled()) {
      instance.destroy();
      if (runtime.adapter.current === instance) runtime.adapter.current = null;
      return {};
    }
    return { instance };
  } catch (error) {
    instance?.destroy();
    if (runtime.adapter.current === instance) runtime.adapter.current = null;
    if (isCancelled()) return {};
    if (!styleLoadError) return { failure: "initFailed" };
    if (error instanceof styleLoadError) return { failure: "vectorFailed" };
    return { failure: "initFailed" };
  }
}
