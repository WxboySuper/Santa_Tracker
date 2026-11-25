import { Circle, Fill, Icon, RegularShape, Stroke, Style } from "ol/style.js";
import type { MarkerPalette, TrackerTheme } from "./tracker-theme";
import { sleighImage } from "./tracker-sleigh-icon";

export interface ThemeMapStyles {
  flown: Style[];
  ahead: Style;
  stopDone: Style;
  stopAhead: Style;
  /** Santa's marker; built lazily because Icon needs the browser's Image, which unit tests lack. */
  marker: (west: boolean) => Style[];
}

function markerBase(marker: MarkerPalette): Style[] {
  const fill = new Fill({ color: marker.fill });
  const stroke = new Stroke({ color: marker.stroke, width: 3 });
  switch (marker.kind) {
    case "badge":
      return [new Style({ image: new Circle({ radius: 21, fill, stroke }) })];
    case "block":
      return [new Style({ image: new RegularShape({ points: 4, radius: 24, angle: Math.PI / 4, fill, stroke: new Stroke({ color: marker.stroke, width: 2.5 }) }) })];
    case "disc":
      return [new Style({ image: new Circle({ radius: 17, fill, stroke: new Stroke({ color: marker.stroke, width: 1.5 }) }) })];
    case "radar":
      return [
        new Style({ image: new Circle({ radius: 36, stroke: new Stroke({ color: "rgba(255, 176, 32, 0.22)", width: 1 }) }) }),
        new Style({ image: new Circle({ radius: 22, stroke: new Stroke({ color: "rgba(255, 176, 32, 0.45)", width: 1 }) }) }),
        new Style({ image: new Circle({ radius: 10, stroke: new Stroke({ color: "rgba(255, 255, 255, 0.75)", width: 1.2 }) }) }),
        new Style({ image: new Circle({ radius: 4.5, fill: new Fill({ color: marker.fill }) }) }),
      ];
    case "pixel":
      return [];
  }
}

function sleighSize(marker: MarkerPalette): { width: number; height: number } {
  if (marker.kind === "pixel") return { width: 64, height: 30 };
  if (marker.kind === "disc") return { width: 28, height: 13 };
  return { width: 36, height: 17 };
}

export function themeMapStyles(theme: TrackerTheme): ThemeMapStyles {
  const { trail, marker } = theme;
  const cache: Partial<Record<"east" | "west", Style[]>> = {};
  const build = (west: boolean): Style[] => {
    const base = markerBase(marker);
    if (marker.kind === "radar") return base;
    return [...base, new Style({ image: new Icon({ src: sleighImage(marker, west), ...sleighSize(marker) }) })];
  };
  return {
    flown: [
      new Style({ stroke: new Stroke({ color: trail.casing, width: trail.casingWidth, lineCap: "round", lineJoin: "round" }) }),
      new Style({ stroke: new Stroke({ color: trail.flown, width: trail.flownWidth, lineCap: "round", lineJoin: "round" }) }),
    ],
    ahead: new Style({ stroke: new Stroke({ color: trail.ahead, width: trail.aheadWidth, lineCap: "round", lineDash: trail.aheadDash }) }),
    stopDone: new Style({ image: new Circle({ radius: trail.stopRadius, fill: new Fill({ color: trail.stopDone }), stroke: new Stroke({ color: trail.stopDoneStroke, width: 1.6 }) }) }),
    stopAhead: new Style({ image: new Circle({ radius: trail.stopRadius - 0.6, fill: new Fill({ color: trail.stopAhead }), stroke: new Stroke({ color: trail.stopAheadStroke, width: 1.4 }) }) }),
    marker: west => (cache[west ? "west" : "east"] ??= build(west)),
  };
}
