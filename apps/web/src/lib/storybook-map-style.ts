/**
 * Recolours the OpenFreeMap "liberty" style into a warm storybook map: parchment land, sea-glass water, soft ink
 * borders and labels, and no roads, buildings or points of interest. Works on the parsed style JSON before it is
 * handed to ol-mapbox-style, so the tiles and glyphs still come from OpenFreeMap.
 */

type Paint = Record<string, unknown>;
type StyleLayer = { id: string; type: string; paint?: Paint; layout?: Record<string, unknown>; [key: string]: unknown };
export type MapStyleJson = { layers: StyleLayer[]; [key: string]: unknown };

export const STORYBOOK = {
  land: "#f2e6c9",
  water: "#a9c4bd",
  waterLabel: "#4f6d68",
  river: "#8fb3ad",
  green: "#cdd4a3",
  ice: "#f8f2e4",
  sand: "#ead6a6",
  border: "#8c6d4b",
  ink: "#4a3524",
  inkSoft: "#6b4f32",
  halo: "#f8efda",
} as const;

/** Layers kept from the source style; everything else (roads, buildings, POIs, shields, aeroways) is dropped. */
const KEEP = /^(background|natural_earth|park|landcover_(wood|grass|ice|sand|wetland)|water|waterway_river|boundary_(2|disputed)|water_name_(point|line)_label|label_(country_[123]|state|city_capital|city|town))$/;

function textPaint(color: string): Paint {
  return { "text-color": color, "text-halo-color": STORYBOOK.halo, "text-halo-width": 1.4, "text-halo-blur": 0.4 };
}

function paintFor(layer: StyleLayer): Paint | undefined {
  const { id } = layer;
  if (id === "background") return { "background-color": STORYBOOK.land };
  if (id === "natural_earth") return { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.28, 6, 0.08] };
  if (id === "water") return { "fill-color": STORYBOOK.water };
  if (id === "waterway_river") return { ...layer.paint, "line-color": STORYBOOK.river };
  if (id === "park" || id === "landcover_wood" || id === "landcover_grass" || id === "landcover_wetland") {
    return { "fill-color": STORYBOOK.green, "fill-opacity": 0.45 };
  }
  if (id === "landcover_ice") return { "fill-color": STORYBOOK.ice, "fill-opacity": 0.9 };
  if (id === "landcover_sand") return { "fill-color": STORYBOOK.sand, "fill-opacity": 0.6 };
  if (id.startsWith("boundary_")) {
    return { "line-color": STORYBOOK.border, "line-opacity": 0.55, "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 6, 1.4], "line-dasharray": [2, 2] };
  }
  if (id.startsWith("water_name")) return textPaint(STORYBOOK.waterLabel);
  if (id.startsWith("label_country")) return textPaint(STORYBOOK.inkSoft);
  if (id.startsWith("label_")) return textPaint(STORYBOOK.ink);
  return layer.paint;
}

export function storybookStyle(style: MapStyleJson): MapStyleJson {
  const layers = style.layers
    .filter(layer => KEEP.test(layer.id))
    // Paint is replaced wholesale, so the wetland sprite pattern becomes a flat tint too.
    .map(layer => {
      const paint = paintFor(layer);
      return paint ? { ...layer, paint } : layer;
    });
  return { ...style, layers };
}
