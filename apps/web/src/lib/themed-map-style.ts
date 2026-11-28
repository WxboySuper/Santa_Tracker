/**
 * Recolours the OpenFreeMap "liberty" style with a tracker theme's palette: land, water, borders and labels only,
 * with roads, buildings and points of interest dropped. Works on the parsed style JSON before it is handed to
 * ol-mapbox-style, so the tiles and glyphs still come from OpenFreeMap.
 */
import type { MapPalette } from "./tracker-theme";

type Paint = Record<string, unknown>;
type StyleLayer = { id: string; type: string; paint?: Paint; layout?: Record<string, unknown>; [key: string]: unknown };
export type MapStyleJson = { layers: StyleLayer[]; [key: string]: unknown };

const BASE = /^(background|natural_earth|park|landcover_(wood|grass|ice|sand|wetland)|water|waterway_river|boundary_(2|disputed))$/;
const LABELS = /^(water_name_(point|line)_label|label_(country_[123]|state|city_capital|city|town))$/;

function textPaint(color: string, palette: MapPalette): Paint {
  return { "text-color": color, "text-halo-color": palette.halo, "text-halo-width": 1.4, "text-halo-blur": 0.4 };
}

function fillPaint(layer: StyleLayer, palette: MapPalette): Paint | undefined {
  const { id } = layer;
  if (id === "background") return { "background-color": palette.land };
  if (id === "water") return { "fill-color": palette.water };
  if (id === "landcover_ice") return { "fill-color": palette.ice, "fill-opacity": 0.9 };
  if (id === "landcover_sand") return { "fill-color": palette.sand, "fill-opacity": 0.6 };
  if (id === "park" || id.startsWith("landcover_")) return { "fill-color": palette.green, "fill-opacity": palette.greenOpacity };
  return undefined;
}

function paintFor(layer: StyleLayer, palette: MapPalette): Paint | undefined {
  const { id } = layer;
  const fill = fillPaint(layer, palette);
  if (fill) return fill;
  if (id === "natural_earth") return { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 0, palette.relief, 6, palette.relief / 3] };
  if (id === "waterway_river") return { ...layer.paint, "line-color": palette.river };
  if (id.startsWith("boundary_")) {
    return { "line-color": palette.border, "line-opacity": palette.borderOpacity, "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 6, 1.4], "line-dasharray": [2, 2] };
  }
  if (id.startsWith("water_name")) return textPaint(palette.waterLabel, palette);
  if (id.startsWith("label_country")) return textPaint(palette.labelSoft, palette);
  if (id.startsWith("label_")) return textPaint(palette.label, palette);
  return layer.paint;
}

export function themedMapStyle(style: MapStyleJson, palette: MapPalette): MapStyleJson {
  const keep = (layer: StyleLayer) => BASE.test(layer.id) || (palette.labels && LABELS.test(layer.id));
  // Paint is replaced wholesale, so the wetland sprite pattern becomes a flat tint too.
  const layers = style.layers.filter(keep).map(layer => {
    const paint = paintFor(layer, palette);
    return paint ? { ...layer, paint } : layer;
  });
  return { ...style, layers };
}
