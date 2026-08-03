import {
  CUSTOM_PRODUCT_LIMITS,
  CUSTOM_PRODUCTS_SCHEMA_VERSION,
  type EmbeddedCustomProductSnapshot,
  type HostedCustomProduct,
} from '../types/customProducts';
import { isCustomCategoryList } from './customCategoryValidation';

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const isBoundedText = (value: unknown): value is string =>
  typeof value === 'string'
  && value.trim() === value
  && value.length > 0
  && value.length <= CUSTOM_PRODUCT_LIMITS.labelLength;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

const isIsoTimestamp = (value: unknown): value is string =>
  typeof value === 'string'
  && ISO_TIMESTAMP.test(value)
  && !Number.isNaN(Date.parse(value))
  && new Date(value).toISOString() === value;

/** Creates a detached snapshot so future product edits cannot alter old maps. */
export const createEmbeddedCustomProductSnapshot = (
  product: HostedCustomProduct,
  capturedAt = new Date().toISOString(),
): EmbeddedCustomProductSnapshot => ({
  schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
  sourceProductId: product.id,
  sourceProductVersion: product.version,
  label: product.label,
  categories: product.categories.map((category) => ({ ...category, style: { ...category.style } })),
  capturedAt,
});

const hasValidSnapshotReferences = (value: Record<string, unknown>): boolean => {
  if (value.sourceProductId !== undefined && !isBoundedText(value.sourceProductId)) return false;
  if (value.sourceProductVersion !== undefined && !isPositiveInteger(value.sourceProductVersion)) return false;
  return true;
};

const hasValidSnapshotContent = (value: Record<string, unknown>): boolean =>
  isBoundedText(value.label)
  && isCustomCategoryList(value.categories)
  && isIsoTimestamp(value.capturedAt);

/** Validates an immutable-by-contract embedded product snapshot. */
export const isEmbeddedCustomProductSnapshot = (value: unknown): value is EmbeddedCustomProductSnapshot => {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ['schemaVersion', 'sourceProductId', 'sourceProductVersion', 'label', 'categories', 'capturedAt'])) return false;
  if (value.schemaVersion !== CUSTOM_PRODUCTS_SCHEMA_VERSION) return false;
  return hasValidSnapshotReferences(value) && hasValidSnapshotContent(value);
};
