import {
  CUSTOM_PRODUCTS_SCHEMA_VERSION,
  type CustomCategoryTemplate,
  type HostedCustomProduct,
  type HostedCustomProductStatus,
} from '../types/customProducts';
import {
  asCustomProductId,
  isHostedCustomProduct,
  reviseHostedCustomProduct,
} from './customProducts';
import type { CustomProductDraft } from './customProductsRepository';

export const normalizeCustomProductCategories = (
  categories: CustomCategoryTemplate[],
): CustomCategoryTemplate[] => categories.map((category, order) => ({
  ...category,
  order,
  style: { ...category.style },
}));

const descriptionFields = (description?: string) => {
  const trimmed = description?.trim();
  return trimmed ? { description: trimmed } : {};
};

const assertValidProduct = (product: HostedCustomProduct): HostedCustomProduct => {
  if (!isHostedCustomProduct(product)) {
    throw new Error('Product name, description, or categories are invalid.');
  }
  return product;
};

export const createHostedProduct = ({
  id,
  userId,
  draft,
  now = new Date().toISOString(),
}: {
  id: string;
  userId: string;
  draft: CustomProductDraft;
  now?: string;
}): HostedCustomProduct => assertValidProduct({
  schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
  id: asCustomProductId(id),
  userId,
  label: draft.label.trim(),
  ...descriptionFields(draft.description),
  version: 1,
  status: 'active',
  categories: normalizeCustomProductCategories(draft.categories),
  createdAt: now,
  updatedAt: now,
});

export const reviseProduct = (
  product: HostedCustomProduct,
  draft: CustomProductDraft,
  status: HostedCustomProductStatus = product.status,
): HostedCustomProduct => {
  const revised = reviseHostedCustomProduct(product, {
    label: draft.label.trim(),
    description: draft.description?.trim() || undefined,
    categories: normalizeCustomProductCategories(draft.categories),
    status,
  });
  if (!draft.description?.trim()) delete revised.description;
  return assertValidProduct(revised);
};

export const sortProducts = (products: HostedCustomProduct[]) => [...products].sort((left, right) => {
  if (left.status !== right.status) return left.status === 'active' ? -1 : 1;
  return left.label.localeCompare(right.label);
});

export const assertExpectedVersion = (
  current: HostedCustomProduct,
  expected: HostedCustomProduct,
): void => {
  if (current.version !== expected.version) {
    throw new Error('This product changed in another session. Refresh and try again.');
  }
};
