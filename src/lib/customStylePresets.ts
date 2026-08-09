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
    description: 'An ordered blue palette for rainfall accumulation areas.',
    version: 1,
    categories: [
      category('rainfall', { id: 'trace', label: 'Trace–0.10 in', order: 0, fillColor: '#dbeafe', strokeColor: '#1e3a8a' }),
      category('rainfall', { id: 'light', label: '0.10–0.50 in', order: 1, fillColor: '#93c5fd', strokeColor: '#1e3a8a' }),
      category('rainfall', { id: 'moderate', label: '0.50–1.00 in', order: 2, fillColor: '#3b82f6', strokeColor: '#172554' }),
      category('rainfall', { id: 'heavy', label: '1.00–2.00 in', order: 3, fillColor: '#1d4ed8', strokeColor: '#172554' }),
      category('rainfall', { id: 'very-heavy', label: '2.00+ in', order: 4, fillColor: '#1e3a8a', strokeColor: '#0f172a' }),
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

/** Returns one detached built-in preset, or undefined for an unknown ID. */
export const getCustomStylePreset = (id: string): CustomStylePreset | undefined => {
  const preset = PRESET_DEFINITIONS[id as CustomStylePresetId];
  return preset ? clonePreset(preset) : undefined;
};

