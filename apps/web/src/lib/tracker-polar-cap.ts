import Feature from "ol/Feature.js";
import { Circle as CircleGeometry, Polygon } from "ol/geom.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import { Fill, Stroke, Style } from "ol/style.js";
import { seeded } from "../components/village/village-kit";

/** Half the width of the Web Mercator world, in metres. Its northern edge is about 85.05 degrees. */
export const WORLD_EDGE = 20037508.342789244;
/** How far the ice cap extends beyond the top of the map, where the true pole would be. */
export const CAP_HEIGHT = 9_500_000;
/** The North Pole station sits on the cap, centred horizontally. */
export const POLE_COORD: [number, number] = [0, WORLD_EDGE + 2_300_000];

/** The view may pan north onto the cap. Everything else keeps the usual world bounds. */
export const VIEW_EXTENT: [number, number, number, number] = [-WORLD_EDGE, -WORLD_EDGE, WORLD_EDGE, WORLD_EDGE + CAP_HEIGHT];

const NIGHT = "#0a1633";
const RING_RADII = [700_000, 1_500_000, 2_500_000, 3_700_000];
const GLOW_BANDS = 26;
const GLOW_BAND_HEIGHT = 60_000;
const STAR_COUNT = 110;

function capFeature(): Feature {
  const polygon = new Polygon([[
    [-WORLD_EDGE, WORLD_EDGE],
    [WORLD_EDGE, WORLD_EDGE],
    [WORLD_EDGE, WORLD_EDGE + CAP_HEIGHT],
    [-WORLD_EDGE, WORLD_EDGE + CAP_HEIGHT],
    [-WORLD_EDGE, WORLD_EDGE],
  ]]);
  const feature = new Feature(polygon);
  feature.setStyle(new Style({ fill: new Fill({ color: NIGHT }) }));
  return feature;
}

/** Stacked translucent bands that read as an aurora glow along the edge of the map. */
function glowFeatures(): Feature[] {
  return Array.from({ length: GLOW_BANDS }, (_, index) => {
    const bottom = WORLD_EDGE + index * GLOW_BAND_HEIGHT;
    const band = new Polygon([[
      [-WORLD_EDGE, bottom],
      [WORLD_EDGE, bottom],
      [WORLD_EDGE, bottom + GLOW_BAND_HEIGHT],
      [-WORLD_EDGE, bottom + GLOW_BAND_HEIGHT],
      [-WORLD_EDGE, bottom],
    ]]);
    const alpha = 0.34 * (1 - index / GLOW_BANDS) ** 2;
    const feature = new Feature(band);
    feature.setStyle(new Style({ fill: new Fill({ color: `rgba(70, 235, 185, ${alpha.toFixed(3)})` }) }));
    return feature;
  });
}

function starFeatures(): Feature[] {
  const random = seeded(2026);
  return Array.from({ length: STAR_COUNT }, () => {
    const point = new CircleGeometry([(random() * 2 - 1) * WORLD_EDGE, WORLD_EDGE + 1_000_000 + random() * (CAP_HEIGHT - 1_200_000)], 9_000 + random() * 22_000);
    const feature = new Feature(point);
    feature.setStyle(new Style({ fill: new Fill({ color: `rgba(255, 244, 220, ${(0.35 + random() * 0.6).toFixed(2)})` }) }));
    return feature;
  });
}

function ringFeature(radius: number): Feature {
  const feature = new Feature(new CircleGeometry(POLE_COORD, radius));
  feature.setStyle(new Style({ stroke: new Stroke({ color: "rgba(255, 213, 138, 0.38)", width: 2, lineDash: [3, 12] }) }));
  return feature;
}

/** A pale polar ice cap with chart-style rings, drawn above the top of the map. */
export function createPolarCapLayer(): VectorLayer {
  const source = new VectorSource({ features: [capFeature(), ...starFeatures(), ...glowFeatures(), ...RING_RADII.map(ringFeature)] });
  return new VectorLayer({ source, zIndex: 1 });
}
