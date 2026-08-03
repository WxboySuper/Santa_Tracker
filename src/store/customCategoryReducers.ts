import type { PayloadAction } from '@reduxjs/toolkit';
import { CUSTOM_PRODUCT_LIMITS, type CustomCategoryTemplate } from '../types/customProducts';
import type { ForecastState } from './forecastSlice';
import { canMoveCustomItem, cloneCustomValue, getCurrentCustomLayers, normalizeCustomOrder, touchCustomLayer } from './customLayerReducerUtils';

/** Category reducers that share the parent forecast day's undo history. */
export const createCustomCategoryReducers = (pushUndoSnapshot: (state: ForecastState) => void) => ({
  addCustomCategory: (state: ForecastState, action: PayloadAction<{ layerId: string; category: CustomCategoryTemplate }>) => {
    const layer = getCurrentCustomLayers(state)?.layers.find(({ id }) => id === action.payload.layerId);
    if (!layer || layer.categories.length >= CUSTOM_PRODUCT_LIMITS.categoriesPerProduct) return;
    pushUndoSnapshot(state);
    layer.categories.push(cloneCustomValue(action.payload.category));
    normalizeCustomOrder(layer.categories);
    touchCustomLayer(layer);
    state.customEditor.activeCategoryId = action.payload.category.id;
    state.isSaved = false;
  },
  updateCustomCategory: (state: ForecastState, action: PayloadAction<{ layerId: string; category: CustomCategoryTemplate }>) => {
    const layer = getCurrentCustomLayers(state)?.layers.find(({ id }) => id === action.payload.layerId);
    const index = layer?.categories.findIndex(({ id }) => id === action.payload.category.id) ?? -1;
    if (!layer || index < 0) return;
    pushUndoSnapshot(state);
    layer.categories[index] = { ...cloneCustomValue(action.payload.category), order: layer.categories[index].order };
    layer.features.forEach((feature) => {
      if (feature.properties.categoryId === action.payload.category.id) feature.properties.title = action.payload.category.label;
    });
    touchCustomLayer(layer);
    state.isSaved = false;
  },
  removeCustomCategory: (state: ForecastState, action: PayloadAction<{ layerId: string; categoryId: string }>) => {
    const layer = getCurrentCustomLayers(state)?.layers.find(({ id }) => id === action.payload.layerId);
    const index = layer?.categories.findIndex(({ id }) => id === action.payload.categoryId) ?? -1;
    if (!layer || index < 0) return;
    if (layer.categories.length === 1) return;
    pushUndoSnapshot(state);
    layer.categories.splice(index, 1);
    layer.features = layer.features.filter(({ properties }) => properties.categoryId !== action.payload.categoryId);
    normalizeCustomOrder(layer.categories);
    state.customEditor.activeCategoryId = layer.categories[Math.min(index, layer.categories.length - 1)]?.id ?? null;
    touchCustomLayer(layer);
    state.isSaved = false;
  },
  moveCustomCategory: (state: ForecastState, action: PayloadAction<{ layerId: string; categoryId: string; direction: -1 | 1 }>) => {
    const layer = getCurrentCustomLayers(state)?.layers.find(({ id }) => id === action.payload.layerId);
    const index = layer?.categories.findIndex(({ id }) => id === action.payload.categoryId) ?? -1;
    const target = index + action.payload.direction;
    if (!layer) return;
    if (!canMoveCustomItem(index, target, layer.categories.length)) return;
    pushUndoSnapshot(state);
    [layer.categories[index], layer.categories[target]] = [layer.categories[target], layer.categories[index]];
    normalizeCustomOrder(layer.categories);
    touchCustomLayer(layer);
    state.isSaved = false;
  },
});
