import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import "ol/ol.css";
import OLMap from "ol/Map";
import View from "ol/View";
import LayerGroup from "ol/layer/Group";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import GeoJSON from "ol/format/GeoJSON";
import { fromLonLat } from "ol/proj";
import { RootState } from "../../store";
import { selectVerificationOutlooksForDay } from "../../store/verificationSlice";
import { setBaseMapStyle } from "../../store/overlaysSlice";
import type { BaseMapStyle } from "../../store/overlaysSlice";
import { computeZIndex, getFeatureStyle } from "../../utils/mapStyleUtils";
import { DayType } from "../../types/outlooks";
import type { MapAdapterHandle } from "../../maps/contracts";
import type { Feature as GeoJsonFeature } from "geojson";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import {
  Circle,
  Fill as StyleFill,
  Stroke as StyleStroke,
  Style as OlStyle,
  Fill,
  Stroke,
  Style,
} from "ol/style";
import { apply } from "ol-mapbox-style";
import Legend from "./Legend";
import UnofficialBadge from "./UnofficialBadge";
import {
  getOpenFreeMapStyleSet,
  isOpenFreeMapStyle,
} from "../../lib/openFreeMap";
import "./ForecastMap.css";
import { ReportType } from "../../types/stormReports";

interface OpenLayersVerificationMapProps {
  activeOutlookType?: "categorical" | "tornado" | "wind" | "hail";
  selectedDay?: DayType;
  legendOpen?: boolean;
}

type VerificationOutlookType = NonNullable<
  OpenLayersVerificationMapProps["activeOutlookType"]
>;

interface ColorWithOpacity {
  color: string;
  alpha: number;
}

interface OutlookStyleDescriptor {
  outlookType: VerificationOutlookType;
  probability: string;
}

interface StrokeDescriptor {
  color: string;
  opacity: number;
  width: number;
}

const TOP_OUTLINE_LAYER_Z_INDEX = 1000;
const TOP_VECTOR_REFERENCE_LAYER_Z_INDEX = 1050;
const TOP_LABEL_LAYER_Z_INDEX = 1100;

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

// Define specific colors for each report type
const reportColors = {
  tornado: "#FF0000", // Red for tornado
  wind: "#0000FF", // Blue for wind
  hail: "#00FF00", // Green for hail
};

// Fallback color for report dots when the report type is not found in reportColors
const FALLBACK_REPORT_COLOR = "#888888";

// Style function for storm reports
const buildReportStyle = (type: ReportType) => {
  return new OlStyle({
    image: new Circle({
      radius: 6,
      fill: new StyleFill({
        color: reportColors[type] || FALLBACK_REPORT_COLOR, // Fallback to grey
      }),
      stroke: new StyleStroke({
        color: "#FFFFFF", // White border
        width: 1,
      }),
    }),
  });
};

// Cached US states GeoJSON for blank map style (fetched once per session)
let cachedUsStatesGeoJSONVerif: object | null = null;

// Blank land fill for verification map.
const BLANK_LAND_FILL_STYLE_VERIF = new Style({
  fill: new Fill({ color: "#f2ede2" }),
});

// Blank land outlines rendered above outlook polygons.
const BLANK_LAND_OUTLINE_STYLE_VERIF = new Style({
  fill: new Fill({ color: "rgba(0, 0, 0, 0)" }),
  stroke: new Stroke({ color: "#9e9585", width: 1 }),
});

/**
 * Create a tile `XYZ` source that provides label-only tiles for the
 * verification map. Returns `null` for styles that don't support
 * a separate label overlay (e.g. 'blank').
 *
 * @param style - The selected base map style (excluding 'blank')
 * @returns An `XYZ` tile source for label-only tiles or `null`.
 */
const createVerificationLabelOverlaySource = (
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

// Function to create tile source based on selected base map style for verification map
export const createVerifTileSource = (
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
          "Tiles &copy; Esri &mdash; Source: Esri i-cubed USDA USGS AEX GeoEye Getmapping Aerogrid IGN IGP UPR-EGP",
        maxZoom: 19,
        crossOrigin: "anonymous",
      });
    default:
      return new OSM({ crossOrigin: "anonymous" });
  }
};

// Function to create a hatch pattern for CIG overlays based on the CIG level
export const createHatchPattern = (cigLevel: string): CanvasPattern | null => {
  const canvas = document.createElement("canvas");
  const size = 10;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (!ctx) return null;

  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 1.1;

  if (cigLevel === "CIG1") {
    // Broken diagonal lines
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(3, 3);
    ctx.moveTo(5, 5);
    ctx.lineTo(10, 10);
    ctx.stroke();
  } else if (cigLevel === "CIG2") {
    // Solid diagonal lines
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

const FUNCTION_COLOR_NOTATION_REGEX = /^(rgba?|hsla?)\(/i;
const CATEGORICAL_OUTLOOK: VerificationOutlookType = "categorical";
const CIG_PREFIX = "CIG";
const FALLBACK_FILL_COLOR = "#999999";
const FALLBACK_STROKE_COLOR = "#000000";
const TRANSPARENT_PATTERN_FILL = "rgba(0,0,0,0)";
const CIG_STROKE_COLOR = "#111111";
const CIG_STROKE_WIDTH = 1.2;
/** Returns true if the color string uses a CSS function notation like rgb(), rgba(), hsl(), or hsla(). */
export const isFunctionColorNotation = (color: string): boolean => {
  return FUNCTION_COLOR_NOTATION_REGEX.test(color);
};

/** Returns `value` as a number if it already is one, otherwise returns `fallback`. */
export const coerceNumber = (value: unknown, fallback: number): number => {
  return typeof value === "number" ? value : fallback;
};

/** Resolves fill opacity from the style payload, defaulting to 0.25 when missing. */
export const resolveFillOpacity = (
  _outlookType: VerificationOutlookType,
  fillOpacity: unknown,
): number => {
  // Verification is an evidence view: forecast paint must never obscure the
  // basemap, state/county lines, or the SPC points being evaluated.
  return Math.min(coerceNumber(fillOpacity, 0.25), 0.42);
};

/** Returns the stroke opacity as a number, defaulting to 1 if the value is not numeric. */
export const resolveStrokeOpacity = (opacity: unknown): number => {
  return coerceNumber(opacity, 1);
};

/** Returns the stroke width as a number, defaulting to 2 if the value is not numeric. */
export const resolveStrokeWidth = (weight: unknown): number => {
  return coerceNumber(weight, 2);
};

/** Returns true if the probability string begins with the CIG prefix, indicating a ceiling-opacity level. */
export const isCigProbability = (probability: string): boolean => {
  return probability.startsWith(CIG_PREFIX);
};

/** Computes the rendering z-index for verification features: CIG overlays use a high-based rank; regular probabilities use the shared computeZIndex utility. */
export const getVerificationStyleZIndex = ({
  outlookType,
  probability,
}: OutlookStyleDescriptor): number => {
  const regularZ = computeZIndex(
    outlookType as VerificationOutlookType,
    probability,
  );
  const cigRank = parseInt(probability.replace(CIG_PREFIX, ""), 10) || 0;
  const cigZ = 1000 + cigRank;

  // CIG overlays must always render above regular probabilities.
  // Within CIG, higher number gets higher priority (CIG3 > CIG2 > CIG1).
  return isCigProbability(probability) ? cigZ : regularZ;
};

/** Builds the OL fill and stroke style parts for a CIG probability level using a canvas hatch pattern. */
export const buildCigStyleParts = (probability: string) => {
  const hatchFill = createHatchPattern(probability) ?? TRANSPARENT_PATTERN_FILL;

  return {
    fill: new Fill({ color: hatchFill }),
    stroke: new Stroke({
      color: CIG_STROKE_COLOR,
      width: CIG_STROKE_WIDTH,
    }),
  };
};

// Utility function to convert hex or named colors to RGBA format with specified alpha for OpenLayers styles
export const toRgbaColor = ({ color, alpha }: ColorWithOpacity): string => {
  if (!color) {
    return `rgba(255,255,255,${alpha})`;
  }

  if (isFunctionColorNotation(color)) {
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

/** Creates an OL Fill with an rgba color derived from the given hex/rgb color and alpha value. */
export const createStandardFill = ({
  color,
  alpha,
}: ColorWithOpacity): Fill => {
  return new Fill({ color: toRgbaColor({ color, alpha }) });
};

/** Creates a standard OpenLayers Stroke from a color, opacity, and width descriptor. */
export const createStandardStroke = ({
  color,
  opacity,
  width,
}: StrokeDescriptor): Stroke => {
  return new Stroke({
    color: toRgbaColor({ color, alpha: opacity }),
    width,
  });
};

// Function to build OpenLayers style for a given feature based on its outlook type and probability,
export const buildStyle = ({
  outlookType,
  probability,
}: OutlookStyleDescriptor) => {
  const style = getFeatureStyle(
    outlookType as VerificationOutlookType,
    probability,
  );
  const fillColor = String(style.fillColor || FALLBACK_FILL_COLOR);
  const strokeColor = String(style.color || FALLBACK_STROKE_COLOR);
  const fillOpacity = resolveFillOpacity(outlookType, style.fillOpacity);
  const strokeOpacity = resolveStrokeOpacity(style.opacity);
  const strokeWidth = resolveStrokeWidth(style.weight);
  const isCig = isCigProbability(probability);
  const styleZ = getVerificationStyleZIndex({ outlookType, probability });
  const styleParts = isCig
    ? buildCigStyleParts(probability)
    : {
        fill: createStandardFill({ color: fillColor, alpha: fillOpacity }),
        stroke: createStandardStroke({
          color: strokeColor,
          opacity: strokeOpacity,
          width: strokeWidth,
        }),
      };

  return new Style({
    zIndex: styleZ,
    stroke: styleParts.stroke,
    fill: styleParts.fill,
  });
};

// Sub-component for the base map style-picker dropdown in the verification map.
const VerifMapStylePicker: React.FC<{
  baseMapStyle: BaseMapStyle;
  onSelect: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ baseMapStyle, onSelect }) => (
  <div className="absolute bottom-full mb-2 right-0 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 shadow-lg p-2 flex flex-col gap-1 min-w-[120px] z-50">
    {(
      [
        { value: "blank", label: "Blank (Weather)" },
        { value: "osm", label: "OpenStreetMap" },
        { value: "carto-light", label: "Light" },
        { value: "carto-dark", label: "Dark" },
        { value: "esri-satellite", label: "Satellite" },
      ] as { value: BaseMapStyle; label: string }[]
    ).map(({ value, label }) => (
      <button
        key={value}
        data-style={value}
        type="button"
        className={`text-left px-2 py-1 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-700 ${baseMapStyle === value ? "font-bold bg-gray-100 dark:bg-gray-700" : ""}`}
        onClick={onSelect}
      >
        {label}
      </button>
    ))}
  </div>
);

/** Map toolbar button that toggles the base map style picker in the verification map. */
const VerifMapStylePickerButton: React.FC<{
  showStylePicker: boolean;
  baseMapStyle: BaseMapStyle;
  onToggle: () => void;
  onSelect: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ showStylePicker, baseMapStyle, onToggle, onSelect }) => (
  <div className="relative">
    <button
      type="button"
      className="map-toolbar-button"
      onClick={onToggle}
      title="Base map style"
      aria-label="Base map style"
    >
      Map
    </button>
    {showStylePicker && (
      <VerifMapStylePicker baseMapStyle={baseMapStyle} onSelect={onSelect} />
    )}
  </div>
);

// OpenLayers map component for verification view,
// supporting categorical and probabilistic outlooks with storm report overlays and base map style switching.
const OpenLayersVerificationMap = forwardRef<
  MapAdapterHandle<OLMap> | null,
  OpenLayersVerificationMapProps
>(({ activeOutlookType = CATEGORICAL_OUTLOOK, selectedDay = 1, legendOpen = false }, ref) => {
  const dispatch = useDispatch();
  const [showStylePicker, setShowStylePicker] = useState(false);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OLMap | null>(null);
  const tileLayerRef = useRef<TileLayer<OSM | XYZ> | null>(null);
  const vectorBaseGroupRef = useRef<LayerGroup | null>(null);
  const vectorReferenceGroupRef = useRef<LayerGroup | null>(null);
  const vectorStyleRequestRef = useRef(0);
  const landSourceRef = useRef<VectorSource>(new VectorSource());
  const landLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const landOutlineLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const labelLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const vectorSourceRef = useRef<VectorSource>(new VectorSource());
  const outlookLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const stormReportsSourceRef = useRef<VectorSource>(new VectorSource()); // New source for storm reports
  const mapView = useSelector(
    (state: RootState) => state.forecast.currentMapView,
  );
  const initialMapViewRef = useRef(mapView);
  const outlooks = useSelector((state: RootState) =>
    selectVerificationOutlooksForDay(state, selectedDay),
  );
  const baseMapStyle = useSelector(
    (state: RootState) => state.overlays.baseMapStyle,
  );
  const {
    reports,
    visible: reportsVisible,
    filterByType,
  } = useSelector((state: RootState) => state.stormReports); // Select storm reports state

  // Memoize active features based on selected outlook type and available outlooks for the day,
  const activeFeatures = useMemo(() => {
    const outlook = outlooks[activeOutlookType];
    if (!outlook) {
      return [] as Array<{ feature: GeoJsonFeature; probability: string }>;
    }

    // Flatten features from the selected outlook type into a single array with associated probabilities for styling.
    const items: Array<{ feature: GeoJsonFeature; probability: string }> = [];
    outlook.forEach((features, probability) => {
      features.forEach((feature) => {
        items.push({ feature, probability });
      });
    });

    return items;
  }, [activeOutlookType, outlooks]);

  useImperativeHandle(
    ref,
    () => ({
      getMap: () => mapRef.current,
      getEngine: () => "openlayers",
      getView: () => ({
        center: mapView.center,
        zoom: mapView.zoom,
      }),
    }),
    [mapView.center, mapView.zoom],
  );

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return undefined;

    const baseTileLayer = new TileLayer({
      source: new OSM({ crossOrigin: "anonymous" }),
    });
    tileLayerRef.current = baseTileLayer;
    const vectorBaseGroup = new LayerGroup({
      visible: false,
      zIndex: 1,
    });
    vectorBaseGroupRef.current = vectorBaseGroup;
    const vectorReferenceGroup = new LayerGroup({
      visible: false,
      zIndex: TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
    });
    vectorReferenceGroupRef.current = vectorReferenceGroup;
    // Land fill sits above the base tile layer for blank style.
    const landLayer = new VectorLayer({
      source: landSourceRef.current,
      visible: false,
      zIndex: 1,
      style: BLANK_LAND_FILL_STYLE_VERIF,
    });
    landLayerRef.current = landLayer;
    const landOutlineLayer = new VectorLayer({
      source: landSourceRef.current,
      visible: false,
      zIndex: TOP_OUTLINE_LAYER_Z_INDEX,
      style: BLANK_LAND_OUTLINE_STYLE_VERIF,
    });
    landOutlineLayerRef.current = landOutlineLayer;
    const outlookLayer = new VectorLayer({
      source: vectorSourceRef.current,
      zIndex: 3,
    });
    outlookLayerRef.current = outlookLayer;
    const labelLayer = new TileLayer({
      source: createVerificationLabelOverlaySource("osm") ?? undefined,
      visible: true,
      zIndex: TOP_LABEL_LAYER_Z_INDEX,
    });
    labelLayerRef.current = labelLayer;

    // Initialize the map with the base tile layer, land layer, outlook layer, and storm reports layer.
    const map = new OLMap({
      target: mapElementRef.current,
      layers: [
        baseTileLayer,
        vectorBaseGroup,
        landLayer,
        outlookLayer,
        landOutlineLayer,
        vectorReferenceGroup,
        new VectorLayer({
          source: stormReportsSourceRef.current,
          zIndex: 4,
          style: (feature) =>
            buildReportStyle(feature.get("type") as ReportType),
        }),
        labelLayer,
      ],
      view: new View({
        center: fromLonLat([
          initialMapViewRef.current.center[1],
          initialMapViewRef.current.center[0],
        ]),
        zoom: initialMapViewRef.current.zoom,
      }),
    });

    mapRef.current = map;

    // As with the forecast map, ensure we recover if the target container is 0x0 at mount.
    const targetEl = mapElementRef.current;
    // Same with the forecast map, update the map safely when timing occurs incorrectly
    const updateSizeSafely = () => {
      try {
        map.updateSize();
      } catch {
        // ignore
      }
    };
    const raf1 = window.requestAnimationFrame(updateSizeSafely);
    const raf2 = window.requestAnimationFrame(updateSizeSafely);
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && targetEl) {
      resizeObserver = new ResizeObserver(() => updateSizeSafely());
      resizeObserver.observe(targetEl);
    }

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      map.setTarget();
      mapRef.current = null;
      vectorBaseGroupRef.current = null;
      vectorReferenceGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const view = map.getView();
    const targetCenter = fromLonLat([mapView.center[1], mapView.center[0]]);
    const currentCenter = view.getCenter();
    const currentZoom = view.getZoom() || 4;

    const centerChanged =
      !currentCenter ||
      Math.abs(currentCenter[0] - targetCenter[0]) > 0.01 ||
      Math.abs(currentCenter[1] - targetCenter[1]) > 0.01;
    const zoomChanged = Math.abs(currentZoom - mapView.zoom) > 0.000001;

    if (!centerChanged && !zoomChanged) {
      return;
    }

    view.setCenter(targetCenter);
    view.setZoom(mapView.zoom);
  }, [mapView.center, mapView.zoom]);

  // Swap base tile source / blank land layer when style changes
  useEffect(() => {
    const tile = tileLayerRef.current;
    const vectorBaseGroup = vectorBaseGroupRef.current;
    const vectorReferenceGroup = vectorReferenceGroupRef.current;
    const land = landLayerRef.current;
    const landOutline = landOutlineLayerRef.current;
    const labels = labelLayerRef.current;
    const el = mapElementRef.current;
    if (
      !tile ||
      !vectorBaseGroup ||
      !vectorReferenceGroup ||
      !land ||
      !landOutline ||
      !labels ||
      !el
    )
      return;

    /**
     * Load US state boundary features into the `landSourceRef` if they
     * are not already present. This creates the state outline layer
     * used for rendering above outlook polygons.
     */
    const loadStatesBoundaries = () => {
      if (landSourceRef.current.getFeatures().length > 0) {
        return;
      }

      /**
       * Fetch and parse US states GeoJSON and add features to the
       * verification map's `landSourceRef`. Cached in
       * `cachedUsStatesGeoJSONVerif` to avoid repeated network calls.
       */
      const loadStates = async () => {
        let geoData = cachedUsStatesGeoJSONVerif;
        if (!geoData) {
          const res = await fetch(
            "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json",
          );
          geoData = await res.json();
          cachedUsStatesGeoJSONVerif = geoData;
        }
        const format = new GeoJSON();
        const features = format.readFeatures(geoData, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });
        landSourceRef.current.addFeatures(features as Feature[]);
      };

      loadStates().catch(() => {
        /* US states layer fetch failed — non-fatal */
      });
    };

    // Keep state outlines above outlook polygons across base-map styles.
    loadStatesBoundaries();

    /** Clears the split OpenFreeMap base/reference groups so non-vector styles can render normally. */
    const hideVectorBasemapGroups = () => {
      vectorBaseGroup.setVisible(false);
      vectorReferenceGroup.setVisible(false);
      vectorBaseGroup.getLayers().clear();
      vectorReferenceGroup.getLayers().clear();
    };

    if (baseMapStyle === "blank") {
      hideVectorBasemapGroups();
      tile.setVisible(false);
      land.setVisible(true);
      landOutline.setVisible(true);
      labels.setVisible(false);
      el.style.backgroundColor = "#b8d4e8";
      return;
    }

    if (isOpenFreeMapStyle(baseMapStyle)) {
      const requestId = vectorStyleRequestRef.current + 1;
      vectorStyleRequestRef.current = requestId;

      tile.setVisible(false);
      land.setVisible(false);
      landOutline.setVisible(true);
      labels.setVisible(false);
      el.style.backgroundColor = "";
      vectorBaseGroup.setVisible(false);
      vectorReferenceGroup.setVisible(false);
      vectorBaseGroup.getLayers().clear();
      vectorReferenceGroup.getLayers().clear();

      getOpenFreeMapStyleSet(baseMapStyle)
        .then(({ baseStyle, overlayStyle }) => {
          const nextBaseGroup = new LayerGroup();
          const nextReferenceGroup = new LayerGroup();

          return Promise.all([
            apply(nextBaseGroup, baseStyle),
            apply(nextReferenceGroup, overlayStyle),
          ]).then(() => ({ nextBaseGroup, nextReferenceGroup }));
        })
        .then(({ nextBaseGroup, nextReferenceGroup }) => {
          if (vectorStyleRequestRef.current !== requestId) {
            return;
          }

          replaceLayerGroupLayers(vectorBaseGroup, nextBaseGroup);
          replaceLayerGroupLayers(vectorReferenceGroup, nextReferenceGroup);
          vectorBaseGroup.setVisible(true);
          vectorReferenceGroup.setVisible(true);
        })
        .catch((error) => {
          if (vectorStyleRequestRef.current !== requestId) {
            return;
          }

          console.warn(
            "[verification-map] falling back to raster basemap after vector load failure",
            {
              baseMapStyle,
              error,
            },
          );
          vectorBaseGroup.getLayers().clear();
          vectorReferenceGroup.getLayers().clear();
          tile.setSource(createVerifTileSource(baseMapStyle));
          tile.setVisible(true);
          const labelSource =
            createVerificationLabelOverlaySource(baseMapStyle);
          if (labelSource) {
            labels.setSource(labelSource);
            labels.setVisible(true);
          }
        });
    } else {
      hideVectorBasemapGroups();
      tile.setVisible(true);
      land.setVisible(false);
      landOutline.setVisible(true);
      el.style.backgroundColor = "";
      tile.setSource(
        createVerifTileSource(baseMapStyle as Exclude<BaseMapStyle, "blank">),
      );
      const labelSource = createVerificationLabelOverlaySource(
        baseMapStyle as Exclude<BaseMapStyle, "blank">,
      );
      if (labelSource) {
        labels.setSource(labelSource);
        labels.setVisible(true);
      } else {
        labels.setVisible(false);
      }
    }
  }, [baseMapStyle]);

  useEffect(() => {
    const outlookLayer = outlookLayerRef.current;
    if (!outlookLayer) {
      return;
    }

    outlookLayer.setOpacity(1);
  }, [activeOutlookType]);

  useEffect(() => {
    const source = vectorSourceRef.current;
    source.clear();

    const format = new GeoJSON();

    // Sort features by computed z-index to ensure correct rendering order in OpenLayers,
    // since it doesn't automatically handle SVG-style layering based on feature properties. Higher z-index features will be added last and rendered on top. CIG overlays are always on top, with CIG3 above CIG2 above CIG1, followed by regular probabilities sorted by their computed z-index.
    const sortedFeatures = [...activeFeatures].sort((a, b) => {
      return (
        computeZIndex(
          activeOutlookType as VerificationOutlookType,
          a.probability,
        ) -
        computeZIndex(
          activeOutlookType as VerificationOutlookType,
          b.probability,
        )
      );
    });

    sortedFeatures.forEach(({ feature, probability }) => {
      const olFeature = format.readFeature(feature, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      });

      if (Array.isArray(olFeature)) {
        olFeature.forEach((item) => {
          item.setStyle(
            buildStyle({ outlookType: activeOutlookType, probability }),
          );
          source.addFeature(item);
        });
      } else {
        olFeature.setStyle(
          buildStyle({ outlookType: activeOutlookType, probability }),
        );
        source.addFeature(olFeature);
      }
    });
  }, [activeFeatures, activeOutlookType]);

  useEffect(() => {
    const source = stormReportsSourceRef.current;
    source.clear();

    if (reportsVisible) {
      // Filter reports based on type visibility settings and active outlook type.
      // If a report type is toggled off in the filter, it will be excluded.
      // Additionally, if the active outlook type is probabilistic (tornado/wind/hail),
      // only matching report types will be shown. If the active outlook type is categorical,
      // all report types will be shown regardless of their specific type, as categorical view encompasses all types.
      const filteredReports = reports.filter((report) => {
        if (!filterByType[report.type]) {
          return false;
        }

        // Probabilistic verification views should only show matching report type.
        // Categorical view keeps all report types visible.
        if (activeOutlookType === CATEGORICAL_OUTLOOK) {
          return true;
        }

        return report.type === activeOutlookType;
      });

      filteredReports.forEach((report) => {
        const geometry = new Point(
          fromLonLat([report.longitude, report.latitude]),
        );
        // Create a new feature for each storm report with the appropriate geometry and styling based on its type,
        // then add it to the storm reports source.
        const feature = new Feature({
          geometry,
          type: report.type, // Store type for styling
          reportId: report.id, // Store ID for potential future interactions
        });
        feature.setStyle(buildReportStyle(report.type));
        source.addFeature(feature);
      });
    }
  }, [reports, reportsVisible, filterByType, activeOutlookType]);

  // Handlers for toolbar buttons to switch interaction modes and toggle style picker.
  const handleToggleStylePicker = () => {
    setShowStylePicker((v) => !v);
  };

  // Handle selection of a base map style from the style picker, updating the Redux store and hiding the picker.
  const handleBaseMapStyleSelect = (e: React.MouseEvent<HTMLButtonElement>) => {
    const style = e.currentTarget.dataset.style as BaseMapStyle | undefined;
    if (!style) {
      return;
    }

    dispatch(setBaseMapStyle(style));
    setShowStylePicker(false);
  };

  return (
    <div className="forecast-map-container" translate="no">
      <div ref={mapElementRef} style={{ width: "100%", height: "100%" }} />
      <div className="map-toolbar-bottom-right">
        <div className="flex items-center gap-1 rounded-md bg-white dark:bg-gray-800 p-1 shadow-md border border-gray-300 dark:border-gray-600">
          <VerifMapStylePickerButton
            showStylePicker={showStylePicker}
            baseMapStyle={baseMapStyle}
            onToggle={handleToggleStylePicker}
            onSelect={handleBaseMapStyleSelect}
          />
        </div>
      </div>
      <Legend activeOutlookType={activeOutlookType} desktopOpen={legendOpen} />
      <UnofficialBadge />
    </div>
  );
});

OpenLayersVerificationMap.displayName = "OpenLayersVerificationMap";

export default OpenLayersVerificationMap;
