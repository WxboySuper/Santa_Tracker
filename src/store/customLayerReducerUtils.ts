import type { OneOffCustomLayer } from '../types/customProducts';
import type { ForecastState } from './forecastSlice';

export const cloneCustomValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const getCurrentCustomLayers = (state: ForecastState) =>
  state.forecastCycle.days[state.forecastCycle.currentDay]?.customLayers;

export const touchCustomLayer = (layer: OneOffCustomLayer) => {
  layer.updatedAt = new Date().toISOString();
};

export const normalizeCustomOrder = <T extends { order: number }>(items: T[]) => {
  items.forEach((item, order) => { item.order = order; });
};

export const canMoveCustomItem = (index: number, target: number, length: number): boolean =>
  index >= 0 && target >= 0 && target < length;
