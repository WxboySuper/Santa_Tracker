import { CUSTOM_PRODUCTS_SCHEMA_VERSION, type HostedCustomProduct } from '../types/customProducts';
import { asCustomProductId } from './customProducts';
import { listCustomStylePresets } from './customStylePresets';
import {
  BUILT_IN_CUSTOM_PRODUCT_USER_ID,
  isTrustedBuiltInCustomProduct,
} from './customProductTrust';

const BUILT_IN_TIMESTAMP = '2026-01-01T00:00:00.000Z';

/** Returns the free, quota-exempt product catalog supplied by GFC. */
export const listBuiltInCustomProducts = (): HostedCustomProduct[] => listCustomStylePresets().map((preset): HostedCustomProduct => ({
  schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
  id: asCustomProductId(`builtin-${preset.id}`),
  userId: BUILT_IN_CUSTOM_PRODUCT_USER_ID,
  builtIn: true,
  label: preset.label,
  description: preset.description,
  version: preset.version,
  status: 'active',
  categories: preset.categories.map((category) => ({ ...category, style: { ...category.style } })),
  createdAt: BUILT_IN_TIMESTAMP,
  updatedAt: BUILT_IN_TIMESTAMP,
}));

export const isBuiltInCustomProduct = isTrustedBuiltInCustomProduct;
