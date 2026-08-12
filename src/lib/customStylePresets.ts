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
    description: 'NHC-style 7-day tropical cyclone formation probability bands.',
    version: 1,
    categories: [
      category('tropical-aoi', { id: 'low', label: '< 40%', order: 0, fillColor: '#ffff00', strokeColor: '#a67c00' }),
      category('tropical-aoi', { id: 'medium', label: '40–60%', order: 1, fillColor: '#ff9966', strokeColor: '#b45309' }),
      category('tropical-aoi', { id: 'high', label: '> 60%', order: 2, fillColor: '#ff6666', strokeColor: '#b91c1c' }),
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

