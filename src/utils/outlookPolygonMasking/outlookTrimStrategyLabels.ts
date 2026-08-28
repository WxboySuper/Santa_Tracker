import type { LandMaskStrategy } from './types';

export const OUTLOOK_TRIM_STRATEGY_OPTIONS: Array<{
  value: LandMaskStrategy;
  label: string;
  description: string;
}> = [
  {
    value: 'us-country-minus-great-lakes',
    label: 'Coast + lakes',
    description: 'US coastline with Great Lakes excluded (recommended prototype).',
  },
  {
    value: 'us-country',
    label: 'Coast only',
    description: 'US coastline; lakes may still receive fill.',
  },
  {
    value: 'us-states-union',
    label: 'State union',
    description: 'Union of state polygons; slower and coarser coastlines.',
  },
];
