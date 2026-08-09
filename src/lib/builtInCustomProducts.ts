import { CUSTOM_PRODUCTS_SCHEMA_VERSION, type HostedCustomProduct } from '../types/customProducts';
import { asCustomProductId } from './customProducts';
import { listCustomStylePresets } from './customStylePresets';

const BUILT_IN_USER_ID = 'gfc-built-in';
const BUILT_IN_TIMESTAMP = '2026-01-01T00:00:00.000Z';

const cloneProduct = (product: HostedCustomProduct): HostedCustomProduct => ({
  ...product,
  categories: product.categories.map((category) => ({ ...category, style: { ...category.style } })),
});

/** Returns the free, quota-exempt product catalog supplied by GFC. */
export const listBuiltInCustomProducts = (): HostedCustomProduct[] => listCustomStylePresets().map((preset): HostedCustomProduct => ({
  schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
  id: asCustomProductId(`builtin-${preset.id}`),
  userId: BUILT_IN_USER_ID,
  builtIn: true,
  label: preset.label,
  description: preset.description,
  version: preset.version,
  status: 'active',
  categories: preset.categories.map((category) => ({ ...category, style: { ...category.style } })),
  createdAt: BUILT_IN_TIMESTAMP,
  updatedAt: BUILT_IN_TIMESTAMP,
})).map(cloneProduct);

export const isBuiltInCustomProduct = (product: HostedCustomProduct): boolean => product.builtIn === true;
