import type { PayloadAction } from '@reduxjs/toolkit';
import { CUSTOM_PRODUCT_LIMITS, type CustomPolygonFeature } from '../types/customProducts';
import type { ForecastState } from './forecastSlice';
import { cloneCustomValue, getCurrentCustomLayers, touchCustomLayer } from './customLayerReducerUtils';

/** Polygon reducers that share the parent forecast day's undo history. */
export const createCustomFeatureReducers = (pushUndoSnapshot: (state: ForecastState) => void) => ({
  addCustomFeature: (state: ForecastState, action: PayloadAction<CustomPolygonFeature>) => {
    const layer = getCurrentCustomLayers(state)?.layers.find(({ id }) => id === action.payload.properties.customLayerId);
    if (!layer) return;
    if (layer.features.length >= CUSTOM_PRODUCT_LIMITS.featuresPerLayer) return;
    if (!layer.categories.some(({ id }) => id === action.payload.properties.categoryId)) return;
    pushUndoSnapshot(state);
    layer.features.push(cloneCustomValue(action.payload));
    touchCustomLayer(layer);
    state.isSaved = false;
  },
  updateCustomFeature: (state: ForecastState, action: PayloadAction<CustomPolygonFeature>) => {
    const layer = getCurrentCustomLayers(state)?.layers.find(({ id }) => id === action.payload.properties.customLayerId);
    const index = layer?.features.findIndex(({ id }) => id === action.payload.id) ?? -1;
    if (!layer || index < 0) return;
    pushUndoSnapshot(state);
    layer.features[index] = cloneCustomValue(action.payload);
    touchCustomLayer(layer);
    state.isSaved = false;
  },
  removeCustomFeature: (state: ForecastState, action: PayloadAction<{ layerId: string; featureId: string }>) => {
    const layer = getCurrentCustomLayers(state)?.layers.find(({ id }) => id === action.payload.layerId);
    const index = layer?.features.findIndex(({ id }) => id === action.payload.featureId) ?? -1;
    if (!layer || index < 0) return;
    pushUndoSnapshot(state);
    layer.features.splice(index, 1);
    touchCustomLayer(layer);
    state.isSaved = false;
  },
});
