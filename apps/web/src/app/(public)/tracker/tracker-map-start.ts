import type { TrackerMapAdapter } from "@/lib/tracker-map-adapter";
import type { OpenLayersTrackerMap } from "@/lib/openlayers-tracker-map";
import type { InteractiveMapMode, MapRuntime, StartResult } from "./tracker-map-types";

type TrackerMapModule = { OpenLayersTrackerMap: typeof OpenLayersTrackerMap };

export async function startAdapter(runtime: Omit<MapRuntime, "mode"> & { mode: InteractiveMapMode }, isCancelled: () => boolean): Promise<StartResult> {
  try {
    const module = await import("@/lib/openlayers-tracker-map");
    return await mountAdapter(runtime, isCancelled, module);
  } catch (error) {
    return handleStartFailure(runtime, isCancelled, error);
  }
}

async function mountAdapter(
  runtime: Omit<MapRuntime, "mode"> & { mode: InteractiveMapMode },
  isCancelled: () => boolean,
  module: TrackerMapModule,
): Promise<StartResult> {
  if (isCancelled()) return {};
  const element = runtime.element.current;
  if (!element) return { failure: "initFailed" };
  const instance = new module.OpenLayersTrackerMap(runtime.mode, () => runtime.dispatch("rasterFailed"), runtime.stopFollowing);
  try {
    instance.setRoute(runtime.nodes);
    if (runtime.position) instance.setSantaPosition(runtime.position);
    await instance.mount(element);
  } catch (error) {
    instance.destroy();
    throw error;
  }
  if (isCancelled()) {
    instance.destroy();
    return {};
  }
  runtime.adapter.current = instance;
  return { instance };
}

function handleStartFailure(
  runtime: Omit<MapRuntime, "mode"> & { mode: InteractiveMapMode },
  isCancelled: () => boolean,
  error: unknown,
): StartResult {
  if (isCancelled()) return {};
  if (isStyleLoadFailure(error)) return { failure: "vectorFailed" };
  return { failure: "initFailed" };
}

function isStyleLoadFailure(error: unknown): boolean {
  return error instanceof Error && error.name === "StyleLoadError";
}
