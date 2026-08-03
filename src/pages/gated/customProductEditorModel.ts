import type { CSSProperties } from 'react';
import type {
  CustomCategoryId,
  CustomCategoryTemplate,
  CustomHatchPattern,
  HostedCustomProduct,
} from '../../types/customProducts';
import type { CustomProductDraft } from '../../lib/customProductsRepository';

const DEFAULT_STYLE = {
  fillColor: '#f97316',
  fillOpacity: 0.45,
  strokeColor: '#c2410c',
  strokeOpacity: 1,
  strokeWidth: 2,
  hatch: 'none' as CustomHatchPattern,
};

const asCategoryId = (value: string): CustomCategoryId => value as CustomCategoryId;

const hexToRgba = (hex: string, alpha: number): string => {
  const numeric = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(numeric >> 16) & 255}, ${(numeric >> 8) & 255}, ${numeric & 255}, ${alpha})`;
};

export const categoryPreviewStyle = (category: CustomCategoryTemplate): CSSProperties => {
  const stroke = hexToRgba(category.style.strokeColor, category.style.strokeOpacity);
  const diagonal = `repeating-linear-gradient(45deg, transparent 0 5px, ${stroke} 5px 7px)`;
  const reverse = `repeating-linear-gradient(-45deg, transparent 0 5px, ${stroke} 5px 7px)`;
  const backgrounds: Record<CustomHatchPattern, string | undefined> = {
    none: undefined,
    diagonal,
    'reverse-diagonal': reverse,
    crosshatch: `${diagonal}, ${reverse}`,
  };
  return {
    backgroundColor: category.style.fillColor,
    backgroundImage: backgrounds[category.style.hatch],
    borderColor: stroke,
    borderWidth: category.style.strokeWidth,
  };
};

export const newCategory = (order: number): CustomCategoryTemplate => ({
  id: asCategoryId(`category-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${order}`}`),
  label: `Category ${order + 1}`,
  order,
  style: { ...DEFAULT_STYLE },
});

export const emptyProductDraft = (): CustomProductDraft => ({
  label: '',
  description: '',
  categories: [newCategory(0)],
});

export const productDraft = (product: HostedCustomProduct): CustomProductDraft => ({
  label: product.label,
  description: product.description ?? '',
  categories: product.categories.map((category) => ({ ...category, style: { ...category.style } })),
});

export const normalizeDraftOrder = (categories: CustomCategoryTemplate[]): CustomCategoryTemplate[] =>
  categories.map((category, order) => ({ ...category, order }));

export const validateProductDraft = (draft: CustomProductDraft): string | null => {
  if (!draft.label.trim()) return 'Enter a product name.';
  if (draft.categories.some((category) => !category.label.trim())) return 'Every category needs a label.';
  return null;
};
