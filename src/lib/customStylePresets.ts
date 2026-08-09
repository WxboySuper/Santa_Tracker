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

const category = (
  presetId: CustomStylePresetId,
  id: string,
  label: string,
  order: number,
  fillColor: string,
  strokeColor: string,
): CustomCategoryTemplate => ({
  id: asCategoryId(`${presetId}-${id}`),
  label,
  order,
  style: {
    fillColor,
    fillOpacity: 0.62,
    strokeColor,
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
      category('rainfall', 'trace', 'Trace–0.10 in', 0, '#dbeafe', '#1e3a8a'),
      category('rainfall', 'light', '0.10–0.50 in', 1, '#93c5fd', '#1e3a8a'),
      category('rainfall', 'moderate', '0.50–1.00 in', 2, '#3b82f6', '#172554'),
      category('rainfall', 'heavy', '1.00–2.00 in', 3, '#1d4ed8', '#172554'),
      category('rainfall', 'very-heavy', '2.00+ in', 4, '#1e3a8a', '#0f172a'),
    ],
  },
  'tropical-aoi': {
    id: 'tropical-aoi',
    label: 'Tropical AOI',
    description: 'A warm-to-red palette for tropical areas of interest.',
    version: 1,
    categories: [
      category('tropical-aoi', 'one', 'Tropical AOI 1', 0, '#fef3c7', '#92400e'),
      category('tropical-aoi', 'two', 'Tropical AOI 2', 1, '#fbbf24', '#92400e'),
      category('tropical-aoi', 'three', 'Tropical AOI 3', 2, '#f97316', '#7c2d12'),
      category('tropical-aoi', 'four', 'Tropical AOI 4', 3, '#ef4444', '#7f1d1d'),
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

