import LayerGroup from "ol/layer/Group";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import GeoJSON from "ol/format/GeoJSON";
import { Fill, Stroke, Style } from "ol/style";
import Overlay from "ol/Overlay";
import type { FeatureLike } from "ol/Feature";
import type OLFeature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import { v4 as uuidv4 } from "uuid";
import type { BaseMapStyle } from "../../store/overlaysSlice";
import { getFeatureStyle, computeZIndex } from "../../utils/mapStyleUtils";
import type {
  Feature as GeoJsonFeature,
  Polygon,
} from "geojson";
import type { CustomCategoryStyle, CustomCategoryTemplate, CustomPolygonFeature, OneOffCustomLayer } from "../../types/customProducts";

type OutlookMapLike = Record<string, globalThis.Map<string, GeoJsonFeature[]>>;
type EditableOutlookType =
  | "categorical"
  | "tornado"
  | "wind"
  | "hail"
  | "totalSevere"
  | "day4-8";

interface FeatureIdentity {
  featureId: string;
  outlookType: string;
  probability: string;
}

interface CustomFeatureIdentity {
  featureId: string;
  customLayerId: string;
  categoryId: string;
  title: string;
}

interface BlankLayerConfig {
  source: VectorSource;
  isLoaded: () => boolean;
  url: string;
  getCache: () => object | null;
  setCache: (data: object) => void;
  style?: Style;
}

interface OutlookSelection {
  outlookType: string;
  probability: string;
}

interface GhostSelection extends OutlookSelection {
  isCategorical: boolean;
}

interface FillBuildInput {
  probability: string;
  fillColor: string;
  fillOpacity: number;
}

interface LayerStyleOptions {
  isTopLayer?: boolean;
  /** Multiplier for fill/stroke alpha when imagery sits beneath outlooks (e.g. Monitor). */
  transparencyScale?: number;
  outlookOpacity?: number;
}

interface RgbaInput {
  color: string;
  alpha: number;
}

interface FillOpacityInput {
  fillOpacity: unknown;
}

interface StrokeWidthInput {
  weight: unknown;
  isTopLayer: boolean;
}

interface HatchPatternInput {
  cigLevel: string;
  alpha?: number;
}

const TOP_OUTLINE_LAYER_Z_INDEX = 1000;
const TOP_VECTOR_REFERENCE_LAYER_Z_INDEX = 1050;
const TOP_LABEL_LAYER_Z_INDEX = 1100;
const GHOST_REFERENCE_LAYER_Z_INDEX = TOP_OUTLINE_LAYER_Z_INDEX - 25;

const DRAWABLE_OUTLOOK_TYPES = new Set<EditableOutlookType>([
  "categorical",
  "tornado",
  "wind",
  "hail",
  "totalSevere",
  "day4-8",
]);

// Helper to convert hex/rgb/hsl color strings to rgba with specified alpha
export const toRgbaColor = ({ color, alpha }: RgbaInput): string => {
  if (!color) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  if (color.startsWith("rgba(") || color.startsWith("hsla(")) {
    return color;
  }

  if (color.startsWith("rgb(") || color.startsWith("hsl(")) {
    return color;
  }

  const hex = color.replace("#", "");
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : hex;

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return color;
  }

  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

// Create canvas pattern for CIG hatching
export const createHatchPattern = ({
  cigLevel,
}: HatchPatternInput): CanvasPattern | null => {
  const canvas = document.createElement("canvas");
  const size = 10;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (!ctx) return null;

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;

  if (cigLevel === "CIG1") {
    // Broken diagonal lines
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(3, 3);
    ctx.moveTo(5, 5);
    ctx.lineTo(10, 10);
    ctx.stroke();
  } else if (cigLevel === "CIG2") {
    // Solid diagonal
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, size);
    ctx.stroke();
  } else if (cigLevel === "CIG3") {
    // Crosshatch
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, size);
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.stroke();
  }

  return ctx.createPattern(canvas, "repeat");
};

/** Returns the fill opacity for a feature or a sensible fallback when a style omitted it. */
export const resolveFillOpacity = ({
  fillOpacity,
}: FillOpacityInput): number => {
  return typeof fillOpacity === "number" ? fillOpacity : 0.25;
};

/** Builds an OL Fill for a given probability: solid rgba fill for standard outlooks, or a CIG hatching CanvasPattern for CIG levels. */
export const createOutlookFill = ({
  probability,
  fillColor,
  fillOpacity,
}: FillBuildInput): Fill => {
  if (!probability.startsWith("CIG")) {
    return new Fill({
      color: toRgbaColor({ color: fillColor, alpha: fillOpacity }),
    });
  }

  const pattern = createHatchPattern({ cigLevel: probability, alpha: fillOpacity });
  if (pattern) {
    return new Fill({ color: pattern as CanvasPattern });
  }

  return new Fill({ color: "rgba(0, 0, 0, 0)" });
};

/** Returns the stroke width: 3px for the top (selected) layer, the numeric weight value otherwise, or 2 as default. */
export const resolveStrokeWidth = ({
  weight,
  isTopLayer,
}: StrokeWidthInput): number => {
  if (isTopLayer) return 3;
  return typeof weight === "number" ? weight : 2;
};

/** Extracts the featureId, outlookType, and probability properties from an OL feature, returning null if any are missing. */
export const getFeatureIdentity = (
  feature: FeatureLike,
): FeatureIdentity | null => {
  const featureId = feature.get("featureId") as string | undefined;
  const outlookType = feature.get("outlookType") as string | undefined;
  const probability = feature.get("probability") as string | undefined;

  if (!featureId) return null;
  if (!outlookType) return null;
  if (!probability) return null;

  return { featureId, outlookType, probability };
};

/** Converts an OL feature back to a GeoJSON Feature object with current projection, enriched with Redux state properties. Returns null if identity or geometry cannot be extracted. */
export const toUpdatedGeoJsonFeature = (
  feature: FeatureLike,
  format: GeoJSON,
  includeDerivedFrom: boolean,
): GeoJsonFeature | null => {
  const identity = getFeatureIdentity(feature);
  if (!identity) return null;

  const geometry = feature.getGeometry();
  if (!geometry) return null;

  const geoJsonGeometry = format.writeGeometryObject(geometry as Geometry, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });

  return {
    type: "Feature",
    id: identity.featureId,
    geometry: geoJsonGeometry as Polygon,
    properties: {
      outlookType: identity.outlookType,
      probability: identity.probability,
      isSignificant: Boolean(feature.get("isSignificant")),
      ...(includeDerivedFrom
        ? { derivedFrom: feature.get("derivedFrom") }
        : {}),
    },
  };
};

/** Iterates over a FeatureLike array and calls setStyle on each, guarding against RenderFeature instances that lack the method. */
export const applyBlankLayerStyle = (features: FeatureLike[], style: Style) => {
  features.forEach((feature) => {
    if ("setStyle" in feature && typeof feature.setStyle === "function") {
      feature.setStyle(style);
    }
  });
};

/** Replaces all layers in the target group with the current layers from the source group. */
export const replaceLayerGroupLayers = (
  target: LayerGroup,
  source: LayerGroup,
) => {
  const targetLayers = target.getLayers();
  targetLayers.clear();
  source
    .getLayers()
    .getArray()
    .forEach((layer) => {
      targetLayers.push(layer);
    });
};

/** Loads GeoJSON features into a blank-basemap VectorSource if not already populated, using an in-memory cache to avoid repeated network requests. */
export const ensureBlankLayerLoaded = async (config: BlankLayerConfig) => {
  if (config.isLoaded()) return;

  let geoJson = config.getCache();
  if (!geoJson) {
    const response = await fetch(config.url);
    geoJson = (await response.json()) as object;
    config.setCache(geoJson);
  }

  if (!geoJson) return;

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

/** Returns true if the given outlook type string is one of the user-editable types defined in DRAWABLE_OUTLOOK_TYPES. */
export const isDrawableOutlookType = ({
  outlookType,
}: {
  outlookType: string;
}): boolean => {
  return DRAWABLE_OUTLOOK_TYPES.has(outlookType as EditableOutlookType);
};

// Convert outlook type and probability to an OpenLayers style, including handling CIG hatching patterns
export const toOlStyle = (
  selection: OutlookSelection,
  options: LayerStyleOptions = {},
) => {
  const { outlookType, probability } = selection;
  const { isTopLayer = false, transparencyScale = 1, outlookOpacity = 1 } = options;
  const alphaScale = Math.min(1, Math.max(0, transparencyScale));

  const style = getFeatureStyle(
    outlookType as EditableOutlookType,
    probability,
  );
  const fillColor = String(style.fillColor || "#ffffff");
  const fillOpacity =
    resolveFillOpacity({ fillOpacity: style.fillOpacity }) * alphaScale * Math.min(1, Math.max(0, outlookOpacity));
  const strokeOpacity =
    (typeof style.opacity === "number" ? style.opacity : 1) * alphaScale;
  const strokeColor = String(style.color || "#000000");
  const zIndex = computeZIndex(outlookType as EditableOutlookType, probability);
  const fill = createOutlookFill({ probability, fillColor, fillOpacity });
  const strokeWidth = resolveStrokeWidth({ weight: style.weight, isTopLayer });

  // For top layer (e.g. categorical), we want a thicker,
  // fully opaque border to clearly delineate features,
  // especially when colors are similar or when CIG hatching is used.
  return new Style({
    fill,
    stroke: new Stroke({
      color: toRgbaColor({ color: strokeColor, alpha: strokeOpacity }),
      width: strokeWidth,
    }),
    zIndex,
  });
};

/** Builds an exact custom category fill, including all supported hatch directions. */
export const createCustomFill = (style: CustomCategoryStyle): Fill => {
  if (style.hatch === "none") {
    return new Fill({ color: toRgbaColor({ color: style.fillColor, alpha: style.fillOpacity }) });
  }
  const canvas = document.createElement("canvas");
  canvas.width = 12;
  canvas.height = 12;
  const context = canvas.getContext("2d");
  if (!context) return new Fill({ color: toRgbaColor({ color: style.fillColor, alpha: style.fillOpacity }) });
  context.fillStyle = toRgbaColor({ color: style.fillColor, alpha: style.fillOpacity });
  context.fillRect(0, 0, 12, 12);
  context.strokeStyle = toRgbaColor({ color: style.strokeColor, alpha: style.strokeOpacity });
  context.lineWidth = Math.max(1, style.strokeWidth / 2);
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
  };
  // Extend strokes beyond the 12px tile boundaries so canvas clipping produces
  // continuous joins without anti-aliasing seams in the repeated pattern.
  if (style.hatch === "diagonal" || style.hatch === "crosshatch") {
    line(-12, 12, 12, -12); line(-12, 24, 24, -12); line(0, 24, 24, 0);
  }
  if (style.hatch === "reverse-diagonal" || style.hatch === "crosshatch") {
    line(-12, 0, 12, 24); line(-12, -12, 24, 24); line(0, -12, 24, 12);
  }
  const pattern = context.createPattern(canvas, "repeat");
  return new Fill({ color: pattern ?? toRgbaColor({ color: style.fillColor, alpha: style.fillOpacity }) });
};

export const toCustomOlStyle = (category: CustomCategoryTemplate, isTopLayer = false, zIndex = 700 + category.order): Style => new Style({
  fill: createCustomFill(category.style),
  stroke: new Stroke({
    color: toRgbaColor({ color: category.style.strokeColor, alpha: category.style.strokeOpacity }),
    width: isTopLayer ? Math.max(3, category.style.strokeWidth) : category.style.strokeWidth,
  }),
  zIndex,
});

export const getCustomFeatureIdentity = (feature: FeatureLike): CustomFeatureIdentity | null => {
  const featureId = feature.get("featureId") as string | undefined;
  const customLayerId = feature.get("customLayerId") as string | undefined;
  const categoryId = feature.get("categoryId") as string | undefined;
  const title = feature.get("title") as string | undefined;
  return featureId && customLayerId && categoryId && title ? { featureId, customLayerId, categoryId, title } : null;
};

export const toUpdatedCustomFeature = (feature: FeatureLike, format: GeoJSON): CustomPolygonFeature | null => {
  const identity = getCustomFeatureIdentity(feature);
  const geometry = feature.getGeometry();
  if (!identity || !geometry) return null;
  return {
    type: "Feature",
    id: identity.featureId,
    geometry: format.writeGeometryObject(geometry as Geometry, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }) as Polygon,
    properties: { customLayerId: identity.customLayerId as CustomPolygonFeature['properties']['customLayerId'], categoryId: identity.categoryId as CustomPolygonFeature['properties']['categoryId'], title: identity.title },
  };
};

/** Converts a completed draw geometry when an active custom draw target exists. */
export const toDrawnCustomFeature = (
  geometry: Geometry,
  layer: OneOffCustomLayer | undefined,
  category: CustomCategoryTemplate | undefined,
  enabled: boolean,
): CustomPolygonFeature | null => {
  if (!enabled) return null;
  if (!layer) return null;
  if (!category) return null;
  return {
    type: "Feature",
    id: uuidv4(),
    geometry: geometry as unknown as Polygon,
    properties: {
      customLayerId: layer.id,
      categoryId: category.id,
      title: category.label,
    },
  };
};

/** Creates a dashed preview style for uncommitted Auto-TSTM guidance. */
export const toTstmPreviewOlStyle = () => {
  const style = getFeatureStyle("categorical", "TSTM");
  const strokeColor = String(style.color || "#1f7a1f");

  return new Style({
    fill: createOutlookFill({
      probability: "TSTM",
      fillColor: String(style.fillColor || "#C1E9C1"),
      fillOpacity: 0.18,
    }),
    stroke: new Stroke({
      color: toRgbaColor({ color: strokeColor, alpha: 0.95 }),
      width: 3,
      lineDash: [10, 6],
    }),
    zIndex: computeZIndex("categorical", "TSTM") + 650,
  });
};

/** Creates a faded style variant for non-active outlooks shown as ghost overlays. */
export const toGhostOlStyle = ({
  outlookType,
  probability,
  isCategorical,
}: GhostSelection) => {
  const style = getFeatureStyle(
    outlookType as EditableOutlookType,
    probability,
  );
  const strokeColor = String(style.color || "#000000");
  const ghostFillOpacity = isCategorical ? 0.08 : 0.03;
  const isCig = probability.startsWith("CIG");

  const fill = isCig
    ? new Fill({ color: "rgba(0,0,0,0)" })
    : createOutlookFill({
        probability,
        fillColor: String(style.fillColor || "#ffffff"),
        fillOpacity: ghostFillOpacity,
      });

  return new Style({
    fill,
    stroke: new Stroke({
      color: toRgbaColor({
        color: strokeColor,
        alpha: isCategorical ? 0.96 : 0.9,
      }),
      width: isCategorical ? 3 : 2.5,
      lineDash: isCig ? [4, 4] : [12, 7],
    }),
    zIndex:
      computeZIndex(outlookType as EditableOutlookType, probability) + 500,
  });
};

// Creates a labels/places overlay source so cities and boundaries stay readable above polygons.
export const createLabelOverlaySource = (
  style: Exclude<BaseMapStyle, "blank">,
): XYZ | null => {
  switch (style) {
    case "osm":
      return new XYZ({
        url: "https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
        attributions: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 19,
        crossOrigin: "anonymous",
      });
    case "carto-light":
      return new XYZ({
        url: "https://{a-d}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
        attributions: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 19,
        crossOrigin: "anonymous",
      });
    case "carto-dark":
      return new XYZ({
        url: "https://{a-d}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
        attributions: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 19,
        crossOrigin: "anonymous",
      });
    case "esri-satellite":
      return new XYZ({
        url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        attributions: "Tiles &copy; Esri",
        maxZoom: 19,
        crossOrigin: "anonymous",
      });
    default:
      return null;
  }
};

// Helper to create tile source based on selected base map style
export const createTileSource = (
  style: Exclude<BaseMapStyle, "blank">,
): OSM | XYZ => {
  switch (style) {
    case "osm":
      return new XYZ({
        url: "https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png",
        attributions:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
        crossOrigin: "anonymous",
      });
    case "carto-light":
      return new XYZ({
        url: "https://{a-d}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
        attributions:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
        crossOrigin: "anonymous",
      });
    case "carto-dark":
      return new XYZ({
        url: "https://{a-d}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
        attributions:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
        crossOrigin: "anonymous",
      });
    case "esri-satellite":
      return new XYZ({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attributions:
          "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP",
        maxZoom: 19,
        crossOrigin: "anonymous",
      });
    default:
      return new OSM({ crossOrigin: "anonymous" });
  }
};

/** Sentinel value used to clear an Overlay's position, causing it to be hidden from the map. */
const OVERLAY_HIDDEN_POSITION: Parameters<Overlay["setPosition"]>[0] =
  undefined;

/** Hides an OpenLayers Overlay by clearing its map position. */
export const hideOverlay = (overlay: Overlay): void => {
  overlay.setPosition(OVERLAY_HIDDEN_POSITION);
};

export type {
  OutlookMapLike,
  EditableOutlookType,
  FeatureIdentity,
  CustomFeatureIdentity,
  BlankLayerConfig,
  OutlookSelection,
  GhostSelection,
  FillBuildInput,
  LayerStyleOptions,
  RgbaInput,
  FillOpacityInput,
  StrokeWidthInput,
  HatchPatternInput,
};
export {
  TOP_OUTLINE_LAYER_Z_INDEX,
  TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
  TOP_LABEL_LAYER_Z_INDEX,
  GHOST_REFERENCE_LAYER_Z_INDEX,
  DRAWABLE_OUTLOOK_TYPES,
};
