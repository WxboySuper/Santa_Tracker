import type { CustomCategoryId, CustomCategoryTemplate } from '../types/customProducts';

export type CustomStylePresetId = 'rainfall' | 'tropical-aoi';

export interface CustomStylePreset {
  id: CustomStylePresetId;
  label: string;
  description: string;
  version: 1;
  categories: CustomCategoryTemplate[];
}

const asCategoryId = (value: string): CustomCategoryId => value as CustomCategoryId;

interface CategoryDefinition {
  id: string;
  label: string;
  order: number;
  fillColor: string;
  strokeColor: string;
}

const category = (
  presetId: CustomStylePresetId,
  definition: CategoryDefinition,
): CustomCategoryTemplate => ({
  id: asCategoryId(`${presetId}-${definition.id}`),
  label: definition.label,
  order: definition.order,
  style: {
    fillColor: definition.fillColor,
    fillOpacity: 0.62,
    strokeColor: definition.strokeColor,
    strokeOpacity: 0.9,
    strokeWidth: 1.5,
    hatch: 'none',
  },
});

const PRESET_DEFINITIONS: Record<CustomStylePresetId, CustomStylePreset> = {
  rainfall: {
    id: 'rainfall',
    label: 'Rainfall',
    description: 'WPC-style Excessive Rainfall Outlook risk categories.',
    version: 1,
    categories: [
      category('rainfall', { id: 'marginal', label: 'Marginal Risk (≥5%)', order: 0, fillColor: '#66A366', strokeColor: '#3f6b3f' }),
      category('rainfall', { id: 'slight', label: 'Slight Risk (≥15%)', order: 1, fillColor: '#FFE066', strokeColor: '#8f7b00' }),
      category('rainfall', { id: 'moderate', label: 'Moderate Risk (≥40%)', order: 2, fillColor: '#E06666', strokeColor: '#8f2e2e' }),
      category('rainfall', { id: 'high', label: 'High Risk (≥70%)', order: 3, fillColor: '#EE99EE', strokeColor: '#8f4f8f' }),
    ],
  },
  'tropical-aoi': {
    id: 'tropical-aoi',
    label: 'Tropical AOI',
    description: 'A warm-to-red palette for tropical areas of interest.',
    version: 1,
    categories: [
      category('tropical-aoi', { id: 'one', label: 'Tropical AOI 1', order: 0, fillColor: '#fef3c7', strokeColor: '#92400e' }),
      category('tropical-aoi', { id: 'two', label: 'Tropical AOI 2', order: 1, fillColor: '#fbbf24', strokeColor: '#92400e' }),
      category('tropical-aoi', { id: 'three', label: 'Tropical AOI 3', order: 2, fillColor: '#f97316', strokeColor: '#7c2d12' }),
      category('tropical-aoi', { id: 'four', label: 'Tropical AOI 4', order: 3, fillColor: '#ef4444', strokeColor: '#7f1d1d' }),
    ],
  },
};

const cloneCategories = (categories: CustomCategoryTemplate[]): CustomCategoryTemplate[] =>
  categories.map((categoryDefinition) => ({
    ...categoryDefinition,
    style: { ...categoryDefinition.style },
  }));

const clonePreset = (preset: CustomStylePreset): CustomStylePreset => ({
  ...preset,
  categories: cloneCategories(preset.categories),
});

/** Returns detached copies of the reviewed built-in custom style presets. */
export const listCustomStylePresets = (): CustomStylePreset[] =>
  Object.values(PRESET_DEFINITIONS).map(clonePreset);

