import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { Feature as GeoJsonFeature } from "geojson";
import type { AppDispatch, RootState } from "../../store";
import {
  selectCanRedo,
  selectCanUndo,
  selectCurrentCustomLayers,
  selectCurrentOutlookOpacity,
  selectCurrentOutlooks,
} from "../../store/forecastSlice";
import { isFeatureExposed } from "../../config/featureExposure";
import type { OutlookMapLike } from "./openLayersMapStyles";

/** The Redux-owned data projection consumed by the OpenLayers map renderer. */
export const useForecastMapReduxState = () => {
  const dispatch = useDispatch<AppDispatch>();
  const drawingState = useSelector((state: RootState) => state.forecast.drawingState);
  const canUndo = useSelector(selectCanUndo);
  const canRedo = useSelector(selectCanRedo);
  const customEditor = useSelector((state: RootState) => state.forecast.customEditor);
  const customLayers = useSelector(selectCurrentCustomLayers);
  const customMode = isFeatureExposed("customProducts") && customEditor.mode === "custom";
  const activeCustomLayer = customLayers.layers.find(({ id }) => id === customEditor.activeLayerId) ?? customLayers.layers[0];
  const activeCustomCategory = activeCustomLayer?.categories.find(({ id }) => id === customEditor.activeCategoryId) ?? activeCustomLayer?.categories[0];
  const currentMapView = useSelector((state: RootState) => state.forecast.currentMapView);
  const outlooks = useSelector(selectCurrentOutlooks) as OutlookMapLike;
  const outlookOpacity = useSelector((state: RootState) => selectCurrentOutlookOpacity(state, drawingState.activeOutlookType));
  const baseMapStyle = useSelector((state: RootState) => state.overlays.baseMapStyle);
  const ghostOutlooks = useSelector((state: RootState) => state.overlays.ghostOutlooks);

  const serializedFeatures = useMemo(() => {
    const items: Array<{ outlookType: string; probability: string; feature: GeoJsonFeature }> = [];
    if (customMode) return items;

    Object.entries(outlooks).forEach(([outlookType, probabilities]) => {
      if (outlookType !== drawingState.activeOutlookType || !(probabilities instanceof Map)) return;
      probabilities.forEach((features: GeoJsonFeature[], probability: string) => {
        features.forEach((feature) => items.push({ outlookType, probability, feature }));
      });
    });
    return items;
  }, [customMode, drawingState.activeOutlookType, outlooks]);

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

  return {
    dispatch,
    drawingState,
    canUndo,
    canRedo,
    customEditor,
    customLayers,
    customMode,
    activeCustomLayer,
    activeCustomCategory,
    currentMapView,
    outlooks,
    outlookOpacity,
    baseMapStyle,
    ghostOutlooks,
    serializedFeatures,
    serializedCustomFeatures,
  };
};
