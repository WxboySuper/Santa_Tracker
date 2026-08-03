import type { PayloadAction } from '@reduxjs/toolkit';
import {
  CUSTOM_PRODUCT_LIMITS,
  type OneOffCustomLayer,
} from '../types/customProducts';
import type { ForecastState } from './forecastSlice';
import { canMoveCustomItem, cloneCustomValue, getCurrentCustomLayers, normalizeCustomOrder, touchCustomLayer } from './customLayerReducerUtils';

/** Builds the custom-layer reducer group while reusing forecast day history. */
export const createCustomLayerReducers = (pushUndoSnapshot: (state: ForecastState) => void) => ({
  setCustomEditorMode: (state: ForecastState, action: PayloadAction<'severe' | 'custom'>) => {
    state.customEditor.mode = action.payload;
  },

  selectCustomLayer: (state: ForecastState, action: PayloadAction<string | null>) => {
    state.customEditor.activeLayerId = action.payload;
    const layer = getCurrentCustomLayers(state)?.layers.find(({ id }) => id === action.payload);
    state.customEditor.activeCategoryId = layer?.categories[0]?.id ?? null;
  },

  selectCustomCategory: (state: ForecastState, action: PayloadAction<string | null>) => {
    state.customEditor.activeCategoryId = action.payload;
  },

  addCustomLayer: (state: ForecastState, action: PayloadAction<OneOffCustomLayer>) => {
    const day = state.forecastCycle.days[state.forecastCycle.currentDay];
    if (!day || (day.customLayers?.layers.length ?? 0) >= CUSTOM_PRODUCT_LIMITS.layersPerCollection) return;
    pushUndoSnapshot(state);
    day.customLayers ??= { schemaVersion: action.payload.schemaVersion, layers: [] };
    day.customLayers.layers.push(cloneCustomValue(action.payload));
    normalizeCustomOrder(day.customLayers.layers);
    state.customEditor.activeLayerId = action.payload.id;
    state.customEditor.activeCategoryId = action.payload.categories[0]?.id ?? null;
    state.isSaved = false;
  },

  updateCustomLayerLabel: (state: ForecastState, action: PayloadAction<{ layerId: string; label: string }>) => {
    const layer = getCurrentCustomLayers(state)?.layers.find(({ id }) => id === action.payload.layerId);
    if (!layer || !action.payload.label.trim()) return;
    pushUndoSnapshot(state);
    layer.label = action.payload.label.trim().slice(0, 64);
    touchCustomLayer(layer);
    state.isSaved = false;
  },

  removeCustomLayer: (state: ForecastState, action: PayloadAction<string>) => {
    const collection = getCurrentCustomLayers(state);
    const index = collection?.layers.findIndex(({ id }) => id === action.payload) ?? -1;
    if (!collection || index < 0) return;
    pushUndoSnapshot(state);
    collection.layers.splice(index, 1);
    normalizeCustomOrder(collection.layers);
    const next = collection.layers[Math.min(index, collection.layers.length - 1)];
    state.customEditor.activeLayerId = next?.id ?? null;
    state.customEditor.activeCategoryId = next?.categories[0]?.id ?? null;
    state.isSaved = false;
  },

  moveCustomLayer: (state: ForecastState, action: PayloadAction<{ layerId: string; direction: -1 | 1 }>) => {
    const layers = getCurrentCustomLayers(state)?.layers;
    if (!layers) return;
    const index = layers?.findIndex(({ id }) => id === action.payload.layerId) ?? -1;
    const target = index + action.payload.direction;
    if (!canMoveCustomItem(index, target, layers.length)) return;
    pushUndoSnapshot(state);
    [layers[index], layers[target]] = [layers[target], layers[index]];
    normalizeCustomOrder(layers);
    state.isSaved = false;
  },

});
