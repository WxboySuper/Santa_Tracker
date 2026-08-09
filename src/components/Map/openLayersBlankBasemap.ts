import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { Fill, Stroke, Style } from "ol/style";
import type { FeatureLike } from "ol/Feature";
import type OLFeature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import { getGeoBoundarySource } from "../../config/geoBoundarySources";

export type BlankLayerKey = "usStates" | "worldCountries" | "lakes";

export interface BlankLayerConfig {
  source: VectorSource;
  isLoaded: () => boolean;
  url: string;
  getCache: () => object | null;
  setCache: (data: object) => void;
  style?: Style;
}

const blankBasemapCache: Record<BlankLayerKey, object | null> = {
  usStates: null,
  worldCountries: null,
  lakes: null,
};

export const BLANK_WORLD_STYLE = new Style({
  fill: new Fill({ color: "#808080" }),
  stroke: new Stroke({ color: "#555555", width: 0.5 }),
});

export const BLANK_LAKE_STYLE = new Style({
  fill: new Fill({ color: "#7BA0C8" }),
  stroke: new Stroke({ color: "#5585b5", width: 0.5 }),
});

export const BLANK_LAND_FILL_STYLE = new Style({
  fill: new Fill({ color: "#f2ede2" }),
});

export const BLANK_LAND_OUTLINE_STYLE = new Style({
  fill: new Fill({ color: "rgba(0, 0, 0, 0)" }),
  stroke: new Stroke({ color: "#333333", width: 1 }),
});

const getStyleForKey = (key: BlankLayerKey): Style | undefined => {
  if (key === "worldCountries") return BLANK_WORLD_STYLE;
  if (key === "lakes") return BLANK_LAKE_STYLE;
  return undefined;
};

/** Builds the fetch/cache contract for one blank-basemap boundary source. */
export const createBlankLayerConfig = (
  key: BlankLayerKey,
  source: VectorSource,
): BlankLayerConfig => ({
  source,
  isLoaded: () => source.getFeatures().length > 0,
  url: getGeoBoundarySource(key).url,
  getCache: () => blankBasemapCache[key],
  setCache: (data) => {
    blankBasemapCache[key] = data;
  },
  style: getStyleForKey(key),
});

/** Applies a fixed style to features that support OpenLayers feature styling. */
export const applyBlankLayerStyle = (features: FeatureLike[], style: Style) => {
  features.forEach((feature) => {
    if ("setStyle" in feature && typeof feature.setStyle === "function") {
      feature.setStyle(style);
    }
  });
};

/** Loads one blank-basemap source once, sharing parsed GeoJSON through the module cache. */
export const ensureBlankLayerLoaded = async (config: BlankLayerConfig) => {
  if (config.isLoaded()) return;

  let geoJson = config.getCache();
  if (!geoJson) {
    const response = await fetch(config.url);
    geoJson = (await response.json()) as object;
    config.setCache(geoJson);
  }

  const format = new GeoJSON();
  const features = format.readFeatures(geoJson, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });

  if (config.style) {
    applyBlankLayerStyle(features as FeatureLike[], config.style);
  }
  config.source.addFeatures(features as unknown as OLFeature<Geometry>[]);
};
