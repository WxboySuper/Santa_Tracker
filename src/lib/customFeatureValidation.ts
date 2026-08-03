import type { CustomPolygonFeature } from '../types/customProducts';
import { CUSTOM_PRODUCT_LIMITS } from '../types/customProducts';
import { hasValidCustomFeatureShape } from './customFeatureShape';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isBoundedText = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.trim() !== value) return false;
  return value.length > 0 && value.length <= CUSTOM_PRODUCT_LIMITS.labelLength;
};

const hasValidProperties = (properties: Record<string, unknown>): boolean => {
  if (!hasOnlyKeys(properties, ['customLayerId', 'categoryId', 'title'])) return false;
  return isBoundedText(properties.customLayerId)
    && isBoundedText(properties.categoryId)
    && isBoundedText(properties.title);
};

const matchesOwner = (
  properties: Record<string, unknown>,
  layerId?: string,
  categoryIds?: ReadonlySet<string>,
): boolean => {
  if (layerId !== undefined && properties.customLayerId !== layerId) return false;
  if (categoryIds === undefined) return true;
  return typeof properties.categoryId === 'string' && categoryIds.has(properties.categoryId);
};

/** Validates bounded custom GeoJSON polygons and their layer/category identities. */
export const isCustomPolygonFeature = (
  value: unknown,
  layerId?: string,
  categoryIds?: ReadonlySet<string>,
): value is CustomPolygonFeature => {
  if (!isRecord(value) || !hasValidCustomFeatureShape(value)) return false;
  const properties = value.properties as Record<string, unknown>;
  return hasValidProperties(properties) && matchesOwner(properties, layerId, categoryIds);
};
