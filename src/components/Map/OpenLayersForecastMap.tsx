import {
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
import { Draw, Modify, Select, Snap } from "ol/interaction";
import { Fill, Stroke, Style } from "ol/style";
import { fromLonLat, toLonLat } from "ol/proj";
import Overlay from "ol/Overlay";
import type { FeatureLike } from "ol/Feature";
import type OLFeature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import { click } from "ol/events/condition";
import { v4 as uuidv4 } from "uuid";
import { Redo2, Undo2 } from "lucide-react";
import { RootState } from "../../store";
import {
  addFeature,
  addCustomFeature,
  removeFeature,
  removeCustomFeature,
  redoLastEdit,
  selectCanRedo,
  selectCanUndo,
  selectCurrentCustomLayers,
  selectCurrentOutlooks,
  selectCurrentOutlookOpacity,
  setMapView,
  undoLastEdit,
  updateFeature,
  updateCustomFeature,
} from "../../store/forecastSlice";

import type { BaseMapStyle } from "../../store/overlaysSlice";
import { computeZIndex } from "../../utils/mapStyleUtils";
import type { MapAdapterHandle } from "../../maps/contracts";
import { getGeoBoundarySource } from "../../config/geoBoundarySources";
import type {
  Feature as GeoJsonFeature,
  GeoJsonProperties,
  Polygon,
} from "geojson";
import { apply } from "ol-mapbox-style";
import Legend from "./Legend";
import StatusOverlay from "./StatusOverlay";
import CategoricalErrorBanner from "./CategoricalErrorBanner";
import UnofficialBadge from "./UnofficialBadge";
import {
  getOpenFreeMapStyleSet,
  isOpenFreeMapStyle,
} from "../../lib/openFreeMap";
import "./ForecastMap.css";
import { isFeatureExposed } from "../../config/featureExposure";
import {
  getForecastSourceDescriptorPlan,
  reconcileFeatureSource,
  type FeatureSyncDescriptor,
} from "./openLayersFeatureSync";

import {
  getFeatureIdentity,
  toUpdatedGeoJsonFeature,
  replaceLayerGroupLayers,
  ensureBlankLayerLoaded,
  isDrawableOutlookType,
  toOlStyle,
  toCustomOlStyle,
  getCustomFeatureIdentity,
  toUpdatedCustomFeature,
  toDrawnCustomFeature,
  toTstmPreviewOlStyle,
  toGhostOlStyle,
  createLabelOverlaySource,
  createTileSource,
  hideOverlay,
  TOP_OUTLINE_LAYER_Z_INDEX,
  TOP_VECTOR_REFERENCE_LAYER_Z_INDEX,
  TOP_LABEL_LAYER_Z_INDEX,
  GHOST_REFERENCE_LAYER_Z_INDEX,
} from "./openLayersMapStyles";
import type { OutlookMapLike, EditableOutlookType, BlankLayerConfig } from "./openLayersMapStyles";

// OpenLayers 10.9.0 stores the delayed pointer callback in this private field:
// https://github.com/openlayers/openlayers/blob/v10.9.0/src/ol/interaction/Draw.js#L740-L751
// Recheck this workaround whenever `ol` is upgraded; remove it once upstream
// guarantees that detaching Draw cancels the pending callback.
type DrawWithPendingPointerMove = {
  downTimeout_?: ReturnType<typeof setTimeout>;
};

/**
 * OpenLayers Draw keeps a delayed pointer-move callback after removal.
 * Cancel it before detaching so it cannot read map pixels after map teardown.
 */
export const removeDrawInteraction = (map: OLMap, interaction: Draw): void => {
  const draw = interaction as unknown as DrawWithPendingPointerMove;
  if (draw.downTimeout_ !== undefined) {
    clearTimeout(draw.downTimeout_);
    draw.downTimeout_ = undefined;
  }

  map.removeInteraction(interaction);
};
// Cached GeoJSON for blank map style — fetched once, shared across re-renders
let cachedUsStatesGeoJSON: object | null = null;
let cachedWorldCountriesGeoJSON: object | null = null;
let cachedLakesGeoJSON: object | null = null;

// Gray style for world landmass (Canada, Mexico, etc.)
const BLANK_WORLD_STYLE = new Style({
  fill: new Fill({ color: "#808080" }),
  stroke: new Stroke({ color: "#555555", width: 0.5 }),
});

// Blue style for lakes (Great Lakes, etc.) — renders above world, below US states
const BLANK_LAKE_STYLE = new Style({
  fill: new Fill({ color: "#7BA0C8" }),
  stroke: new Stroke({ color: "#5585b5", width: 0.5 }),
});

// Cream fill for US land.
const BLANK_LAND_FILL_STYLE = new Style({
  fill: new Fill({ color: "#f2ede2" }),
});

// Outline-only style for US state borders rendered above outlook polygons.
const BLANK_LAND_OUTLINE_STYLE = new Style({
  fill: new Fill({ color: "rgba(0, 0, 0, 0)" }),
  stroke: new Stroke({ color: "#333333", width: 1 }),
});


/** Applies preview styling and metadata before adding one OL feature to the preview source. */
const addTstmPreviewOlFeature = (
  item: OLFeature<Geometry>,
  previewSource: VectorSource,
  previewStyle: ReturnType<typeof toTstmPreviewOlStyle>,
  featureId: string,
): void => {
  item.setStyle(previewStyle);
  item.set("featureId", featureId);
  item.set("outlookType", "categorical");
  item.set("probability", "TSTM");
  previewSource.addFeature(item);
};

/** Replaces Auto-TSTM preview features on a dedicated map source. */
const syncTstmPreviewSource = (
  previewSource: VectorSource,
  tstmPreviewFeatures: GeoJsonFeature[],
) => {
  previewSource.clear();
  const format = new GeoJSON();
  const previewStyle = toTstmPreviewOlStyle();

  tstmPreviewFeatures.forEach((feature) => {
    const olFeature = format.readFeature(feature, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });
    const featureId = String(feature.id ?? "tstm-preview");

    if (Array.isArray(olFeature)) {
      olFeature.forEach((item: FeatureLike) =>
        addTstmPreviewOlFeature(item as OLFeature<Geometry>, previewSource, previewStyle, featureId),
      );
    } else {
      addTstmPreviewOlFeature(olFeature as OLFeature<Geometry>, previewSource, previewStyle, featureId);
    }
  });
};

type OpenLayersForecastMapProps = {
  tstmPreviewFeatures?: GeoJsonFeature[];
};

// Main map component using OpenLayers, implementing the MapAdapterHandle interface for integration with the rest of the app.
const OpenLayersForecastMap = forwardRef<MapAdapterHandle<OLMap> | null, OpenLayersForecastMapProps>(
  ({ tstmPreviewFeatures = [] }, ref) => {
    const dispatch = useDispatch();
    const [interactionMode, setInteractionMode] = useState<
      "pan" | "draw" | "delete"
    >("pan");

    const [popupInfo, setPopupInfo] = useState<{
      outlookType: string;
      probability: string;
      isSignificant: boolean;
    } | null>(null);
    const [showDesktopLegend, setShowDesktopLegend] = useState(true);
    const [showMobileLegend, setShowMobileLegend] = useState(false);
    const drawingState = useSelector(
      (state: RootState) => state.forecast.drawingState,
    );
    const canUndo = useSelector(selectCanUndo);
    const canRedo = useSelector(selectCanRedo);
    const customEditor = useSelector((state: RootState) => state.forecast.customEditor);
    const customLayers = useSelector(selectCurrentCustomLayers);
    const customMode = isFeatureExposed("customProducts") && customEditor.mode === "custom";
    const activeCustomLayer = customLayers.layers.find(({ id }) => id === customEditor.activeLayerId) ?? customLayers.layers[0];
    const activeCustomCategory = activeCustomLayer?.categories.find(({ id }) => id === customEditor.activeCategoryId) ?? activeCustomLayer?.categories[0];
    const currentMapView = useSelector(
      (state: RootState) => state.forecast.currentMapView,
    );
    const outlooks = useSelector(selectCurrentOutlooks) as OutlookMapLike;
    const outlookOpacity = useSelector((state: RootState) => selectCurrentOutlookOpacity(state, drawingState.activeOutlookType));
    const baseMapStyle = useSelector(
      (state: RootState) => state.overlays.baseMapStyle,
    );
    const ghostOutlooks = useSelector(
      (state: RootState) => state.overlays.ghostOutlooks,
    );
    const initialMapViewRef = useRef(currentMapView);
    const currentMapViewRef = useRef(currentMapView);
    const popupRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<Overlay | null>(null);
    const interactionModeRef = useRef(interactionMode);
    const customModeRef = useRef(customMode);

    useEffect(() => {
      interactionModeRef.current = interactionMode;
    }, [interactionMode]);

    useEffect(() => { customModeRef.current = customMode; }, [customMode]);

    useEffect(() => {
      currentMapViewRef.current = currentMapView;
    }, [currentMapView]);

    const mapElementRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<OLMap | null>(null);
    const tileLayerRef = useRef<TileLayer<OSM | XYZ> | null>(null);
    const vectorBaseGroupRef = useRef<LayerGroup | null>(null);
    const vectorReferenceGroupRef = useRef<LayerGroup | null>(null);
    const vectorStyleRequestRef = useRef(0);
    const worldSourceRef = useRef<VectorSource>(new VectorSource());
    const worldLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
    const lakesSourceRef = useRef<VectorSource>(new VectorSource());
    const lakesLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
    const landSourceRef = useRef<VectorSource>(new VectorSource());
    const landLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
    const landOutlineLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
    const labelLayerRef = useRef<TileLayer<XYZ> | null>(null);
    const vectorSourceRef = useRef<VectorSource>(new VectorSource());
    const catSourceRef = useRef<VectorSource>(new VectorSource());
    const ghostSourceRef = useRef<VectorSource>(new VectorSource());
    const tstmPreviewSourceRef = useRef<VectorSource>(new VectorSource());
    const catLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
    const ghostLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
    const tstmPreviewLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
    const vectorLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
    const drawRef = useRef<Draw | null>(null);
    const modifyRef = useRef<Modify | null>(null);
    const catModifyRef = useRef<Modify | null>(null);
    const snapRef = useRef<Snap | null>(null);
    const catSnapRef = useRef<Snap | null>(null);
    const ghostSnapRef = useRef<Snap | null>(null);
    const selectRef = useRef<Select | null>(null);
    const isApplyingExternalViewRef = useRef(false);

    // Serialize features from the Redux store into a flat array for rendering on the map.
    const serializedFeatures = useMemo(() => {
      const items: Array<{
        outlookType: string;
        probability: string;
        feature: GeoJsonFeature;
        zIndex: number;
      }> = [];
      if (customMode) return items;
      Object.entries(outlooks).forEach(([outlookType, probs]) => {
        if (outlookType !== drawingState.activeOutlookType) {
          return;
        }

        if (!(probs instanceof Map)) return;
        probs.forEach((features: GeoJsonFeature[], probability: string) => {
          features.forEach((feature: GeoJsonFeature) => {
            items.push({
              outlookType,
              probability,
              feature,
              zIndex: computeZIndex(outlookType as EditableOutlookType, probability),
            });
          });
        });
      });
      return items;
    }, [outlooks, drawingState.activeOutlookType, customMode]);

    const serializedCustomFeatures = useMemo(() => {
      if (!customMode) return [];
      return customLayers.layers.flatMap((layer) => {
        const categories = new Map(layer.categories.map((category) => [category.id, category]));
        return layer.features.flatMap((feature) => {
          const category = categories.get(feature.properties.categoryId);
          return category ? [{ feature, category, layer }] : [];
        });
      });
    }, [customLayers.layers, customMode]);

    useImperativeHandle(
      ref,
      () => ({
        getMap: () => mapRef.current,
        getEngine: () => "openlayers",
        getView: () => {
          if (!mapRef.current) {
            return { center: [39.8283, -98.5795] as [number, number], zoom: 4 };
          }
          const view = mapRef.current.getView();
          const center = view.getCenter();
          const zoom = view.getZoom() || 4;
          const lonLat = center
            ? (toLonLat(center) as [number, number])
            : ([-98.5795, 39.8283] as [number, number]);
          return { center: [lonLat[1], lonLat[0]], zoom };
        },
      }),
      [],
    );

    useEffect(() => {
      if (!mapElementRef.current || mapRef.current) return undefined;

      const tileLayer = new TileLayer({
        source: new OSM({ crossOrigin: "anonymous" }),
      });
      tileLayerRef.current = tileLayer;
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
      // Blank base map layers: start hidden, only one (tile vs. world+lakes+land) will be visible at a time based on baseMapStyle.
      const worldLayer = new VectorLayer({
        source: worldSourceRef.current,
        visible: false,
        zIndex: 1,
      });
      worldLayerRef.current = worldLayer;
      // Lakes layer sits above world layer to provide better definition of coastlines and inland water bodies,
      // especially when using blank basemap style.
      const lakesLayer = new VectorLayer({
        source: lakesSourceRef.current,
        visible: false,
        zIndex: 1.5,
      });
      lakesLayerRef.current = lakesLayer;
      // Land fill sits above world and lakes, below outlook polygons.
      const landLayer = new VectorLayer({
        source: landSourceRef.current,
        visible: false,
        zIndex: 2,
        style: BLANK_LAND_FILL_STYLE,
      });
      landLayerRef.current = landLayer;
      // Land outlines sit above outlook polygons so borders remain visible.
      const landOutlineLayer = new VectorLayer({
        source: landSourceRef.current,
        visible: false,
        zIndex: TOP_OUTLINE_LAYER_Z_INDEX,
        style: BLANK_LAND_OUTLINE_STYLE,
      });
      landOutlineLayerRef.current = landOutlineLayer;
      // Categorical features stay in a dedicated source so their edit flow
      // remains separate from probabilistic outlook layers.
      const catLayer = new VectorLayer({
        source: catSourceRef.current,
        zIndex: 3,
        opacity: 1,
      });
      catLayerRef.current = catLayer;
      const ghostLayer = new VectorLayer({
        source: ghostSourceRef.current,
        zIndex: GHOST_REFERENCE_LAYER_Z_INDEX,
      });
      ghostLayerRef.current = ghostLayer;
      const tstmPreviewLayer = new VectorLayer({
        source: tstmPreviewSourceRef.current,
        zIndex: TOP_OUTLINE_LAYER_Z_INDEX + 5,
      });
      tstmPreviewLayerRef.current = tstmPreviewLayer;
      // Probabilistic/other features layer: separate source, normal per-feature opacity
      const vectorLayer = new VectorLayer({
        source: vectorSourceRef.current,
        zIndex: 4,
      });
      vectorLayerRef.current = vectorLayer;
      // Place labels/cities above outlook polygons.
      const labelLayer = new TileLayer({
        source: createLabelOverlaySource("osm") ?? undefined,
        visible: true,
        zIndex: TOP_LABEL_LAYER_Z_INDEX,
      });
      labelLayerRef.current = labelLayer;

      // Initialize the map with all layers, but only the tile layer visible by default.
      // The blank basemap layers will be toggled on if the user selects the blank style.
      // This allows us to keep all layers in place and just switch visibility/styles
      // without needing to re-add/remove layers or features, which can be expensive.
      const map = new OLMap({
        target: mapElementRef.current,
        layers: [
          tileLayer,
          vectorBaseGroup,
          worldLayer,
          lakesLayer,
          landLayer,
          ghostLayer,
          catLayer,
          tstmPreviewLayer,
          vectorLayer,
          landOutlineLayer,
          vectorReferenceGroup,
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

      map.on("moveend", () => {
        if (isApplyingExternalViewRef.current) {
          return;
        }

        const view = map.getView();
        const center = view.getCenter();
        if (!center) return;
        const [lon, lat] = toLonLat(center);
        const nextCenter: [number, number] = [lat, lon];
        const nextZoom = view.getZoom() || 4;
        const [stateLat, stateLon] = currentMapViewRef.current.center;
        const stateZoom = currentMapViewRef.current.zoom;

        const centerChanged =
          Math.abs(stateLat - nextCenter[0]) > 0.000001 ||
          Math.abs(stateLon - nextCenter[1]) > 0.000001;
        const zoomChanged = Math.abs(stateZoom - nextZoom) > 0.000001;

        if (centerChanged || zoomChanged) {
          dispatch(setMapView({ center: nextCenter, zoom: nextZoom }));
        }
      });

      mapRef.current = map;

      // Some browsers/devices (notably some Chromebooks) can mount the map into a container
      // that temporarily measures 0x0 due to flex/layout timing. OpenLayers logs a warning
      // and may not render until updateSize() is called after layout stabilizes.
      const targetEl = mapElementRef.current;
      // Safely update the map size when flex/layout timing occurs incorrectly
      const updateSizeSafely = () => {
        try {
          map.updateSize();
        } catch {
          // Non-fatal: map may be disposing.
        }
      };
      // Double requestAnimationFrame calls back to back for layout stabilization
      let raf2: number | null = null;
      const raf1 = window.requestAnimationFrame(() => {
        updateSizeSafely();
        raf2 = requestAnimationFrame(updateSizeSafely);
      });
      let resizeObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined" && targetEl) {
        resizeObserver = new ResizeObserver(() => updateSizeSafely());
        resizeObserver.observe(targetEl);
      }

      // Create popup element imperatively to prevent React/OpenLayers DOM ownership conflict.
      const popupEl = document.createElement("div");
      popupEl.className = "ol-popup";
      popupEl.setAttribute("translate", "no");
      popupEl.style.display = "none";
      popupRef.current = popupEl;
      const overlay = new Overlay({
        element: popupEl,
        autoPan: {
          animation: {
            duration: 250,
          },
        },
      });
      map.addOverlay(overlay);
      overlayRef.current = overlay;

      // Add click handler for pan mode
      map.on("click", (evt) => {
        if (interactionModeRef.current !== "pan") {
          return;
        }

        // Use forEachFeatureAtPixel to get the topmost feature at the clicked pixel,
        // which accounts for z-index and layer visibility.
        const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
          layerFilter: (layer) =>
            layer === vectorLayerRef.current || layer === catLayerRef.current,
        });
        if (feature && overlayRef.current) {
          const customIdentity = getCustomFeatureIdentity(feature);
          const outlookType = customIdentity
            ? (feature.get("customLayerTitle") as string || "Custom layer")
            : feature.get("outlookType") as string;
          const probability = customIdentity?.title ?? feature.get("probability") as string;
          const isSignificant = feature.get("isSignificant") as boolean;

          setPopupInfo({ outlookType, probability, isSignificant });
          overlayRef.current.setPosition(evt.coordinate);
        } else if (overlayRef.current) {
          hideOverlay(overlayRef.current);
          setPopupInfo(null);
        }
      });

      const modify = new Modify({ source: vectorSourceRef.current });

      modify.on("modifyend", (event) => {
        const format = new GeoJSON();
        event.features.forEach((feature) => {
          const customFeature = toUpdatedCustomFeature(feature, format);
          if (customFeature) {
            dispatch(updateCustomFeature(customFeature));
            return;
          }
          const updatedFeature = toUpdatedGeoJsonFeature(
            feature,
            format,
            false,
          );
          if (updatedFeature) {
            dispatch(updateFeature({ feature: updatedFeature }));
          }
        });
      });
      map.addInteraction(modify);
      modifyRef.current = modify;

      // Separate modify interaction for categorical layer to handle its unique properties
      // and to prevent accidental edits of auto-generated categorical features.
      const catModify = new Modify({ source: catSourceRef.current });
      catModify.on("modifyend", (event) => {
        const format = new GeoJSON();
        event.features.forEach((feature) => {
          const derivedFrom = feature.get("derivedFrom") as string | undefined;
          if (derivedFrom !== "auto-generated") {
            const updatedFeature = toUpdatedGeoJsonFeature(
              feature,
              format,
              true,
            );
            if (updatedFeature) {
              dispatch(updateFeature({ feature: updatedFeature }));
            }
          }
        });
      });
      map.addInteraction(catModify);
      catModifyRef.current = catModify;

      const snap = new Snap({ source: vectorSourceRef.current });
      map.addInteraction(snap);
      snapRef.current = snap;

      const catSnap = new Snap({ source: catSourceRef.current });
      map.addInteraction(catSnap);
      catSnapRef.current = catSnap;

      const ghostSnap = new Snap({ source: ghostSourceRef.current });
      map.addInteraction(ghostSnap);
      ghostSnapRef.current = ghostSnap;

      // Limit delete picking to editable outlook layers so top overlays (state outlines/labels)
      // do not intercept clicks and prevent polygon deletion.
      const select = new Select({
        condition: click,
        layers: [vectorLayer, catLayer],
      });
      select.setActive(false);
      select.on("select", (event) => {
        const selected = event.selected[0];
        if (!selected) {
          return;
        }

        const outlookType = selected.get("outlookType") as string | undefined;
        const derivedFrom = selected.get("derivedFrom") as string | undefined;

        // Auto-generated categorical polygons are derived from probabilistic outlooks.
        // Keep them read-only here; users should edit tornado/wind/hail/totalSevere
        // (or draw/delete TSTM manually) and let auto-categorical regenerate.
        if (outlookType === "categorical" && derivedFrom === "auto-generated") {
          select.getFeatures().clear();
          return;
        }

        const customIdentity = getCustomFeatureIdentity(selected);
        if (customIdentity) {
          dispatch(removeCustomFeature({ layerId: customIdentity.customLayerId, featureId: customIdentity.featureId }));
          select.getFeatures().clear();
          return;
        }

        const identity = getFeatureIdentity(selected);
        if (!identity) {
          select.getFeatures().clear();
          return;
        }

        dispatch(
          removeFeature({
            outlookType: identity.outlookType as EditableOutlookType,
            probability: identity.probability,
            featureId: identity.featureId,
          }),
        );

        select.getFeatures().clear();
        return;
      });
      map.addInteraction(select);
      selectRef.current = select;

      return () => {
        window.cancelAnimationFrame(raf1);
        if (raf2 !== null) window.cancelAnimationFrame(raf2);
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
        if (drawRef.current) {
          removeDrawInteraction(map, drawRef.current);
          drawRef.current = null;
        }
        if (modifyRef.current) {
          map.removeInteraction(modifyRef.current);
        }
        if (catModifyRef.current) {
          map.removeInteraction(catModifyRef.current);
        }
        if (snapRef.current) {
          map.removeInteraction(snapRef.current);
        }
        if (catSnapRef.current) {
          map.removeInteraction(catSnapRef.current);
        }
        if (ghostSnapRef.current) {
          map.removeInteraction(ghostSnapRef.current);
        }
        if (selectRef.current) {
          map.removeInteraction(selectRef.current);
        }
        if (overlayRef.current) {
          map.removeOverlay(overlayRef.current);
          overlayRef.current = null;
        }
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
        map.setTarget();
        mapRef.current = null;
        vectorBaseGroupRef.current = null;
        vectorReferenceGroupRef.current = null;
        vectorLayerRef.current = null;
      };
    }, [dispatch]);

    useEffect(() => {
      if (!selectRef.current) {
        return;
      }

      selectRef.current.setActive(interactionMode === "delete");
      if (interactionMode !== "delete") {
        selectRef.current.getFeatures().clear();
      }

      // Hide popup when not in pan mode
      if (interactionMode !== "pan") {
        if (overlayRef.current) {
          hideOverlay(overlayRef.current);
        }
        setPopupInfo(null);
      }
    }, [interactionMode]);

    useEffect(() => {
      // Keep snapping enabled outside delete mode for draw/modify workflows.
      const enableSnap = interactionMode !== "delete";
      if (snapRef.current) {
        snapRef.current.setActive(enableSnap);
      }
      if (catSnapRef.current) {
        catSnapRef.current.setActive(enableSnap);
      }
      if (ghostSnapRef.current) {
        ghostSnapRef.current.setActive(enableSnap);
      }
    }, [interactionMode]);

    useEffect(() => {
      const el = popupRef.current;
      if (!el) return;
      if (popupInfo) {
        el.style.display = "block";
        el.innerHTML = "";
        const content = document.createElement("div");
        content.className = "ol-popup-content";
        const name = document.createElement("div");
        name.className = "text-sm font-semibold capitalize";
        name.textContent = popupInfo.outlookType;
        const prob = document.createElement("div");
        prob.className = "text-xs";
        prob.textContent =
          popupInfo.probability +
          (popupInfo.isSignificant ? " (Significant)" : "");
        content.appendChild(name);
        content.appendChild(prob);
        el.appendChild(content);
      } else {
        el.style.display = "none";
        el.innerHTML = "";
      }
    }, [popupInfo]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      const view = map.getView();
      const targetCenter = fromLonLat([
        currentMapView.center[1],
        currentMapView.center[0],
      ]);
      const currentCenter = view.getCenter();
      const currentZoom = view.getZoom() || 4;

      const centerChanged =
        !currentCenter ||
        Math.abs(currentCenter[0] - targetCenter[0]) > 0.01 ||
        Math.abs(currentCenter[1] - targetCenter[1]) > 0.01;
      const zoomChanged =
        Math.abs(currentZoom - currentMapView.zoom) > 0.000001;

      if (!centerChanged && !zoomChanged) {
        return;
      }

      isApplyingExternalViewRef.current = true;
      view.setCenter(targetCenter);
      view.setZoom(currentMapView.zoom);
      setTimeout(() => {
        isApplyingExternalViewRef.current = false;
      }, 0);
    }, [currentMapView.center, currentMapView.zoom]);

    // Swap base tile source / blank land layer when style changes
    useEffect(() => {
      const tile = tileLayerRef.current;
      const vectorBaseGroup = vectorBaseGroupRef.current;
      const vectorReferenceGroup = vectorReferenceGroupRef.current;
      const world = worldLayerRef.current;
      const lakes = lakesLayerRef.current;
      const land = landLayerRef.current;
      const landOutline = landOutlineLayerRef.current;
      const labels = labelLayerRef.current;
      const el = mapElementRef.current;
      if (
        !tile ||
        !vectorBaseGroup ||
        !vectorReferenceGroup ||
        !world ||
        !lakes ||
        !land ||
        !landOutline ||
        !labels ||
        !el
      )
        return;

      /**
       * Ensure US states GeoJSON for the blank/base map is loaded into
       * the `landSourceRef` so state outlines can be rendered above
       * outlook polygons. Fetches data once and caches it in
       * `cachedUsStatesGeoJSON`.
       */
      const loadUsStatesBoundaries = () => {
        const landLoader: BlankLayerConfig = {
          source: landSourceRef.current,
          isLoaded: () => landSourceRef.current.getFeatures().length > 0,
          url: getGeoBoundarySource("usStates").url,
          getCache: () => cachedUsStatesGeoJSON,
          setCache: (data) => {
            cachedUsStatesGeoJSON = data;
          },
        };
        ensureBlankLayerLoaded(landLoader).catch(() => {
          /* US states outline fetch failed — non-fatal */
        });
      };

      // Keep state outlines available above outlook polygons in every map style.
      loadUsStatesBoundaries();

      /** Clears the split OpenFreeMap base/reference groups so raster and blank modes stay isolated. */
      const hideVectorBasemapGroups = () => {
        vectorBaseGroup.setVisible(false);
        vectorReferenceGroup.setVisible(false);
        vectorBaseGroup.getLayers().clear();
        vectorReferenceGroup.getLayers().clear();
      };

      if (baseMapStyle === "blank") {
        hideVectorBasemapGroups();
        tile.setVisible(false);
        world.setVisible(true);
        lakes.setVisible(true);
        land.setVisible(true);
        landOutline.setVisible(true);
        labels.setVisible(false);
        // Deeper ocean blue
        el.style.backgroundColor = "#7BA0C8";

        const loaders: BlankLayerConfig[] = [
          {
            source: worldSourceRef.current,
            isLoaded: () => worldSourceRef.current.getFeatures().length > 0,
            url: getGeoBoundarySource("worldCountries").url,
            getCache: () => cachedWorldCountriesGeoJSON,
            setCache: (data) => {
              cachedWorldCountriesGeoJSON = data;
            },
            style: BLANK_WORLD_STYLE,
          },
          {
            source: lakesSourceRef.current,
            isLoaded: () => lakesSourceRef.current.getFeatures().length > 0,
            url: getGeoBoundarySource("lakes").url,
            getCache: () => cachedLakesGeoJSON,
            setCache: (data) => {
              cachedLakesGeoJSON = data;
            },
            style: BLANK_LAKE_STYLE,
          },
          {
            source: landSourceRef.current,
            isLoaded: () => landSourceRef.current.getFeatures().length > 0,
            url: getGeoBoundarySource("usStates").url,
            getCache: () => cachedUsStatesGeoJSON,
            setCache: (data) => {
              cachedUsStatesGeoJSON = data;
            },
          },
        ];

        loaders.forEach((loader) => {
          ensureBlankLayerLoaded(loader).catch((loadError) => {
            console.error(`Blank map layer failed to load from ${loader.url}`, loadError);
          });
        });
        return;
      }

      if (isOpenFreeMapStyle(baseMapStyle)) {
        const requestId = vectorStyleRequestRef.current + 1;
        vectorStyleRequestRef.current = requestId;

        tile.setVisible(false);
        world.setVisible(false);
        lakes.setVisible(false);
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
              "[forecast-map] falling back to raster basemap after vector load failure",
              {
                baseMapStyle,
                error,
              },
            );
            vectorBaseGroup.getLayers().clear();
            vectorReferenceGroup.getLayers().clear();
            tile.setSource(createTileSource(baseMapStyle));
            tile.setVisible(true);
            const labelSource = createLabelOverlaySource(baseMapStyle);
            if (labelSource) {
              labels.setSource(labelSource);
              labels.setVisible(true);
            }
          });
      } else {
        hideVectorBasemapGroups();
        tile.setVisible(true);
        world.setVisible(false);
        lakes.setVisible(false);
        land.setVisible(false);
        landOutline.setVisible(true);
        el.style.backgroundColor = "";
        tile.setSource(
          createTileSource(baseMapStyle as Exclude<BaseMapStyle, "blank">),
        );
        const labelSource = createLabelOverlaySource(
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
      const map = mapRef.current;
      if (!map) return;

      if (drawRef.current) {
        removeDrawInteraction(map, drawRef.current);
        drawRef.current = null;
      }

      if (interactionMode !== "draw") {
        return;
      }

      if (
        !customMode && !isDrawableOutlookType({ outlookType: drawingState.activeOutlookType })
      ) {
        return;
      }

      if (customMode && (!activeCustomLayer || !activeCustomCategory)) return;

      const drawSource =
        drawingState.activeOutlookType === "categorical"
          ? catSourceRef.current
          : vectorSourceRef.current;
      const draw = new Draw({ source: drawSource, type: "Polygon" });
      draw.on("drawend", (event) => {
        const format = new GeoJSON();
        const olGeometry = event.feature.getGeometry();
        if (!olGeometry) {
          return;
        }

        // Convert the drawn geometry to GeoJSON format with the correct projections for storage in Redux.
        const geometry = format.writeGeometryObject(olGeometry, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });
        // Create a new feature object with the drawn geometry and current drawing state properties,
        // then dispatch an action to add it to the Redux store.
        const customFeature = toDrawnCustomFeature(
          geometry as unknown as Geometry,
          activeCustomLayer,
          activeCustomCategory,
          customMode,
        );
        if (customFeature) {
          dispatch(addCustomFeature(customFeature));
          return;
        }

        const feature: GeoJsonFeature<Polygon, GeoJsonProperties> = {
          type: "Feature",
          id: uuidv4(),
          geometry: geometry as Polygon,
          properties: {
            outlookType: drawingState.activeOutlookType,
            probability: drawingState.activeProbability,
            isSignificant: drawingState.isSignificant,
          },
        };
        dispatch(addFeature({ feature }));
      });
      map.addInteraction(draw);
      drawRef.current = draw;

      // OpenLayers evaluates interactions in reverse insertion order.
      // Re-adding snap interactions here ensures snap runs before draw,
      // so the cursor actually snaps instead of only showing a snap hint.
      if (snapRef.current) {
        map.removeInteraction(snapRef.current);
        map.addInteraction(snapRef.current);
      }
      if (catSnapRef.current) {
        map.removeInteraction(catSnapRef.current);
        map.addInteraction(catSnapRef.current);
      }
      if (ghostSnapRef.current) {
        map.removeInteraction(ghostSnapRef.current);
        map.addInteraction(ghostSnapRef.current);
      }
    }, [
      dispatch,
      drawingState.activeOutlookType,
      drawingState.activeProbability,
      drawingState.isSignificant,
      customMode,
      activeCustomLayer,
      activeCustomCategory,
      interactionMode,
    ]);

    useEffect(() => {
      const source = vectorSourceRef.current;
      const catSource = catSourceRef.current;
      const ghostSource = ghostSourceRef.current;
      const format = new GeoJSON();
      const maxZIndex = serializedFeatures.reduce(
        (max, { zIndex }) => Math.max(max, zIndex),
        -Infinity,
      );

      const normalDescriptors: FeatureSyncDescriptor[] = serializedFeatures.map(
        ({ outlookType, probability, feature, zIndex }, index) => {
          const stableId = feature.id == null ? `legacy-index-${index}` : String(feature.id);
          const isCategorical = outlookType === "categorical";
          const isTopLayer = zIndex === maxZIndex;
          const targetSource = isCategorical ? catSource : source;

          return {
            // Legacy serialized forecasts may omit feature ids; position is the
            // only stable identity available for those entries.
            key: `normal:${outlookType}:${probability}:${stableId}`,
            feature,
            stableId,
            signature: [
              outlookType,
              probability,
              isTopLayer,
              outlookOpacity,
              Boolean(feature.properties?.isSignificant),
              String(feature.properties?.derivedFrom),
            ].join("|"),
            read: () => format.readFeature(feature, {
              dataProjection: "EPSG:4326",
              featureProjection: "EPSG:3857",
            }),
            apply: (item: OLFeature<Geometry>) => {
              item.setStyle(
                toOlStyle(
                  { outlookType, probability },
                  { isTopLayer, outlookOpacity },
                ),
              );
              item.set("featureId", stableId);
              item.set("outlookType", outlookType);
              item.set("probability", probability);
              item.set("isSignificant", Boolean(feature.properties?.isSignificant));
              item.set("derivedFrom", feature.properties?.derivedFrom);
            },
            targetSource,
          };
        },
      );

      const highestCustomZIndex = Math.max(
        ...serializedCustomFeatures.map(({ layer, category }) =>
          700 + layer.order * 20 + category.order,
        ),
        700,
      );
      const customDescriptors: FeatureSyncDescriptor[] = customMode
        ? serializedCustomFeatures.map(({ feature, category, layer }, index) => {
            const stableId = feature.id == null ? `legacy-index-${index}` : String(feature.id);
            const zIndex = 700 + layer.order * 20 + category.order;
            return {
              key: `custom:${layer.id}:${stableId}`,
              feature,
              stableId,
              signature: [
                layer.id,
                layer.label,
                layer.order,
                category.id,
                category.label,
                category.order,
                JSON.stringify(category.style),
                zIndex === highestCustomZIndex,
              ].join("|"),
              read: () => format.readFeature(feature, {
                dataProjection: "EPSG:4326",
                featureProjection: "EPSG:3857",
              }),
              apply: (item: OLFeature<Geometry>) => {
                item.setStyle(
                  toCustomOlStyle(
                    category,
                    zIndex === highestCustomZIndex,
                    zIndex,
                  ),
                );
                item.set("featureId", stableId);
                item.set("customLayerId", layer.id);
                item.set("customLayerTitle", layer.label);
                item.set("categoryId", category.id);
                item.set("title", category.label);
              },
              targetSource: source,
            };
          })
        : [];

      const ghostDescriptors: FeatureSyncDescriptor[] = [];
      Object.entries(outlooks).forEach(([outlookType, probs]) => {
        if (
          customMode ||
          outlookType === drawingState.activeOutlookType ||
          !ghostOutlooks[outlookType as EditableOutlookType]
        ) {
          return;
        }

        if (!(probs instanceof Map)) return;

        probs.forEach((features: GeoJsonFeature[], probability: string) => {
          const isCategorical = outlookType === "categorical";
          features.forEach((feature, index) => {
            const stableId = feature.id == null ? `legacy-index-${index}` : String(feature.id);
            ghostDescriptors.push({
              key: `ghost:${outlookType}:${probability}:${stableId}`,
              feature,
              stableId,
              signature: [
                outlookType,
                probability,
                isCategorical,
                Boolean(feature.properties?.isSignificant),
                String(feature.properties?.derivedFrom),
              ].join("|"),
              read: () => format.readFeature(feature, {
                dataProjection: "EPSG:4326",
                featureProjection: "EPSG:3857",
              }),
              apply: (item: OLFeature<Geometry>) => {
                item.setStyle(
                  toGhostOlStyle({ outlookType, probability, isCategorical }),
                );
                item.set("featureId", stableId);
                item.set("outlookType", outlookType);
                item.set("probability", probability);
                item.set("isSignificant", Boolean(feature.properties?.isSignificant));
                item.set("derivedFrom", feature.properties?.derivedFrom);
              },
              targetSource: ghostSource,
            });
          });
        });
      });

      const sourceDescriptorPlan = getForecastSourceDescriptorPlan({
        normalDescriptors,
        customMode,
        customDescriptors,
        source,
        categoricalSource: catSource,
      });
      reconcileFeatureSource(source, sourceDescriptorPlan.source);
      reconcileFeatureSource(catSource, sourceDescriptorPlan.categorical);
      reconcileFeatureSource(ghostSource, ghostDescriptors);
    }, [
      serializedFeatures,
      outlookOpacity,
      serializedCustomFeatures,
      customMode,
      outlooks,
      drawingState.activeOutlookType,
      ghostOutlooks,
    ]);

    useEffect(() => {
      syncTstmPreviewSource(tstmPreviewSourceRef.current, tstmPreviewFeatures);
    }, [tstmPreviewFeatures]);

    // Handlers for toolbar buttons to switch interaction modes and toggle style picker.
    const handleSetModePan = () => {
      setInteractionMode("pan");
    };

    // Draw mode allows users to draw new polygons on the map, which are then added to the Redux store and rendered on the map.
    const handleSetModeDraw = () => {
      setInteractionMode("draw");
    };

    // Delete mode allows users to click on existing polygons to remove them from the map and the Redux store.
    const handleSetModeDelete = () => {
      setInteractionMode("delete");
    };

    return (
      <div className="map-container" translate="no">
        <div ref={mapElementRef} style={{ width: "100%", height: "100%" }} />
        <div className="map-toolbar-bottom-right">
          <div className="map-toolbar-surface">
            <button
              type="button"
              className={`map-toolbar-button mode-pan ${interactionMode === "pan" ? "active" : ""}`}
              onClick={handleSetModePan}
              title="Pan map"
              aria-label="Pan map"
            >
              Pan
            </button>
            <button
              type="button"
              onClick={handleSetModeDraw}
              className={`map-toolbar-button mode-draw ${interactionMode === "draw" ? "active" : ""}`}
              title="Draw polygons"
              aria-label="Draw polygons"
            >
              Draw
            </button>
            <button
              type="button"
              onClick={handleSetModeDelete}
              className={`map-toolbar-button mode-delete ${interactionMode === "delete" ? "active" : ""}`}
              title="Delete polygons"
              aria-label="Delete polygons"
            >
              Delete
            </button>
            <span className="map-toolbar-divider" aria-hidden="true" />
            <button
              type="button"
              className={`map-toolbar-button mode-key ${showDesktopLegend ? "active" : ""}`}
              onClick={() => setShowDesktopLegend((isVisible) => !isVisible)}
              title={showDesktopLegend ? "Hide map key" : "Show map key"}
              aria-label={showDesktopLegend ? "Hide map key" : "Show map key"}
              aria-expanded={showDesktopLegend}
            >
              Key
            </button>
            <span className="map-toolbar-spacer" aria-hidden="true" />
            <div className="map-history-group" aria-label="Map edit history">
              <button
                type="button"
                className="map-toolbar-button map-history-button"
                onClick={() => dispatch(undoLastEdit())}
                disabled={!canUndo}
                title="Undo last map edit (Ctrl/Cmd+Z)"
                aria-label="Undo"
              >
                <Undo2 className="map-history-icon" aria-hidden="true" />
                <span className="map-history-label">Undo</span>
              </button>
              <button
                type="button"
                className="map-toolbar-button map-history-button"
                onClick={() => dispatch(redoLastEdit())}
                disabled={!canRedo}
                title="Redo last map edit (Ctrl/Cmd+Y)"
                aria-label="Redo"
              >
                <Redo2 className="map-history-icon" aria-hidden="true" />
                <span className="map-history-label">Redo</span>
              </button>
            </div>
          </div>
          <div className="map-toolbar-help-surface">
            {interactionMode === "draw" &&
              "Draw mode: click to place points, double-click to finish polygon."}
            {interactionMode === "delete" &&
              "Delete mode: click any polygon to remove it."}
            {interactionMode === "pan" &&
              "Pan mode: drag map to move, scroll to zoom. Click a polygon to see its details."}
          </div>
        </div>
        <Legend desktopOpen={showDesktopLegend} mobileOpen={showMobileLegend} showReportLegend={false} />
        <button
          type="button"
          className={`map-key-popout-button ${showMobileLegend ? "active" : ""}`}
          onClick={() => setShowMobileLegend((isVisible) => !isVisible)}
          title={showMobileLegend ? "Hide map key" : "Show map key"}
          aria-label={showMobileLegend ? "Hide map key" : "Show map key"}
          aria-expanded={showMobileLegend}
        >
          <span aria-hidden="true">{showMobileLegend ? "▾" : "▴"}</span>
          Key
        </button>
        <StatusOverlay />
        <CategoricalErrorBanner />
        <UnofficialBadge />
      </div>
    );
  },
);

OpenLayersForecastMap.displayName = "OpenLayersForecastMap";

export default OpenLayersForecastMap;
