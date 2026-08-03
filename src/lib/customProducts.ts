import {
  CUSTOM_PRODUCT_LIMITS,
  CUSTOM_PRODUCTS_SCHEMA_VERSION,
  type CustomLayerId,
  type CustomLayerCollection,
  type CustomProductAccessState,
  type CustomProductId,
  type HostedCustomProduct,
  type HostedCustomProductStatus,
  type OneOffCustomLayer,
} from '../types/customProducts';
import { isCustomPolygonFeature } from './customFeatureValidation';
import { isCustomCategoryList } from './customCategoryValidation';
import {
  createEmbeddedCustomProductSnapshot,
  isEmbeddedCustomProductSnapshot,
} from './customProductSnapshots';

export { isCustomPolygonFeature } from './customFeatureValidation';
export {
  isCustomCategoryList,
  isCustomCategoryStyle,
  isCustomCategoryTemplate,
} from './customCategoryValidation';
export {
  createEmbeddedCustomProductSnapshot,
  isEmbeddedCustomProductSnapshot,
} from './customProductSnapshots';

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Returns true only for non-array object records. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** Rejects persistence fields outside a contract's explicit allowlist. */
const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

/** Validates trimmed non-empty text against a bounded length. */
const isBoundedText = (value: unknown, max: number = CUSTOM_PRODUCT_LIMITS.labelLength): value is string =>
  typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;

/** Validates a canonical UTC ISO timestamp. */
const isIsoTimestamp = (value: unknown): value is string =>
  typeof value === 'string'
  && ISO_TIMESTAMP.test(value)
  && !Number.isNaN(Date.parse(value))
  && new Date(value).toISOString() === value;

/** Validates a whole number that may be zero. */
const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Validates a whole number that starts at one. */
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

/** Validates a timestamp pair whose update cannot precede creation. */
const hasValidChronology = (createdAt: unknown, updatedAt: unknown): boolean =>
  isIsoTimestamp(createdAt)
  && isIsoTimestamp(updatedAt)
  && Date.parse(updatedAt) >= Date.parse(createdAt);

/** Combines field-level checks without a compound validator conditional. */
const areAllValid = (checks: readonly boolean[]): boolean => checks.every(Boolean);

/** Validates the bounded feature-array portion of a one-off layer. */
const hasValidFeatureCount = (features: unknown): boolean =>
  Array.isArray(features) && features.length <= CUSTOM_PRODUCT_LIMITS.featuresPerLayer;

/** Validates an optional embedded product snapshot. */
const hasValidProductSnapshot = (snapshot: unknown): boolean =>
  snapshot === undefined || isEmbeddedCustomProductSnapshot(snapshot);

/** Validates the scalar, category, snapshot, and timestamp fields on a one-off layer. */
const hasValidOneOffLayerFields = (value: Record<string, unknown>): boolean => areAllValid([
  value.schemaVersion === CUSTOM_PRODUCTS_SCHEMA_VERSION,
  isBoundedText(value.id),
  isBoundedText(value.label),
  isNonNegativeInteger(value.order),
  isCustomCategoryList(value.categories),
  hasValidFeatureCount(value.features),
  hasValidChronology(value.createdAt, value.updatedAt),
  hasValidProductSnapshot(value.productSnapshot),
]);

/** Validates a complete self-contained one-off layer. */
export const isOneOffCustomLayer = (value: unknown): value is OneOffCustomLayer => {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, [
    'schemaVersion', 'id', 'label', 'order', 'categories', 'features', 'productSnapshot', 'createdAt', 'updatedAt',
  ])) return false;
  if (!hasValidOneOffLayerFields(value)) return false;
  const layer = value as unknown as OneOffCustomLayer;
  const categoryIds = new Set(layer.categories.map((category) => category.id));
  return layer.features.every((feature) => isCustomPolygonFeature(feature, layer.id, categoryIds));
};

/** Validates a bounded, uniquely identified, contiguously ordered layer collection. */
export const isCustomLayerCollection = (value: unknown): value is CustomLayerCollection => {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ['schemaVersion', 'layers'])) return false;
  if (value.schemaVersion !== CUSTOM_PRODUCTS_SCHEMA_VERSION || !Array.isArray(value.layers)) return false;
  if (value.layers.length > CUSTOM_PRODUCT_LIMITS.layersPerCollection) return false;
  if (!value.layers.every(isOneOffCustomLayer)) return false;
  const ids = new Set(value.layers.map((layer) => layer.id));
  return ids.size === value.layers.length
    && value.layers.every((layer, index) => layer.order === index);
};

/** Validates an optional bounded product description. */
const isOptionalDescription = (value: unknown): boolean =>
  value === undefined || (typeof value === 'string' && value.length <= 500);

/** Validates the active/archive lifecycle value. */
const isHostedProductStatus = (value: unknown): value is HostedCustomProductStatus =>
  value === 'active' || value === 'archived';

/** Validates all fields after a hosted product's strict key check. */
const hasValidHostedProductFields = (value: Record<string, unknown>): boolean => areAllValid([
  value.schemaVersion === CUSTOM_PRODUCTS_SCHEMA_VERSION,
  isBoundedText(value.id),
  isBoundedText(value.userId, 128),
  isBoundedText(value.label),
  isOptionalDescription(value.description),
  isPositiveInteger(value.version),
  isHostedProductStatus(value.status),
  isCustomCategoryList(value.categories),
  hasValidChronology(value.createdAt, value.updatedAt),
]);

/** Validates the owner-scoped reusable product persistence shape. */
export const isHostedCustomProduct = (value: unknown): value is HostedCustomProduct => {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, [
    'schemaVersion', 'id', 'userId', 'label', 'description', 'version', 'status', 'categories', 'createdAt', 'updatedAt',
  ])) return false;
  return hasValidHostedProductFields(value);
};

/** Derives editability without mutating persisted product or embedded snapshot data. */
export const getCustomProductAccessState = ({
  premiumActive,
  status,
}: {
  premiumActive: boolean;
  status: HostedCustomProductStatus;
}): CustomProductAccessState => {
  if (status === 'archived') return { mode: 'read-only', reason: 'archived' };
  if (!premiumActive) return { mode: 'read-only', reason: 'premium-expired' };
  return { mode: 'editable' };
};

/** Returns the next safe revision number or rejects an exhausted counter. */
const getNextProductVersion = (version: number): number => {
  const nextVersion = version + 1;
  if (!Number.isSafeInteger(nextVersion)) {
    throw new RangeError('Custom product version has reached the safe integer limit');
  }
  return nextVersion;
};

/** Produces the next stable product revision while preserving identity and creation time. */
export const reviseHostedCustomProduct = (
  product: HostedCustomProduct,
  changes: Pick<HostedCustomProduct, 'label' | 'description' | 'categories' | 'status'>,
  updatedAt = new Date().toISOString(),
): HostedCustomProduct => {
  if (!isHostedCustomProduct(product)) throw new TypeError('Cannot revise an invalid custom product');
  const revised: HostedCustomProduct = {
    ...product,
    ...changes,
    categories: changes.categories.map((category) => ({ ...category, style: { ...category.style } })),
    version: getNextProductVersion(product.version),
    updatedAt,
  };
  if (!isHostedCustomProduct(revised) || Date.parse(updatedAt) < Date.parse(product.updatedAt)) {
    throw new TypeError('Custom product revision is invalid');
  }
  return revised;
};

/** Seeds a self-contained empty layer from a reusable product snapshot. */
export const createLayerFromHostedProduct = ({
  product,
  layerId,
  order,
  createdAt = new Date().toISOString(),
}: {
  product: HostedCustomProduct;
  layerId: CustomLayerId;
  order: number;
  createdAt?: string;
}): OneOffCustomLayer => {
  if (!isHostedCustomProduct(product)) throw new TypeError('Cannot create a layer from an invalid custom product');
  const productSnapshot = createEmbeddedCustomProductSnapshot(product, createdAt);
  const layer: OneOffCustomLayer = {
    schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
    id: layerId,
    label: product.label,
    order,
    categories: productSnapshot.categories.map((category) => ({ ...category, style: { ...category.style } })),
    features: [],
    productSnapshot,
    createdAt,
    updatedAt: createdAt,
  };
  if (!isOneOffCustomLayer(layer)) throw new TypeError('Custom layer seed is invalid');
  return layer;
};

/** Brands a validated opaque string as a custom layer identifier. */
export const asCustomLayerId = (value: string): CustomLayerId => value as CustomLayerId;

/** Brands a validated opaque string as a hosted custom product identifier. */
export const asCustomProductId = (value: string): CustomProductId => value as CustomProductId;
