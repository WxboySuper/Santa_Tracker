import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';

/** How a land mask polygon is derived from vendored boundary datasets. */
export type LandMaskStrategy =
  | 'us-states-union'
  | 'us-country'
  | 'us-country-minus-great-lakes';

/** When masking runs relative to the drawing workflow (product design options). */
export type MaskApplicationTiming =
  | 'on-draw-end'
  | 'on-modify-end'
  | 'on-demand'
  | 'render-only'
  | 'export-only';

/** Whether clipped geometry is persisted or only shown transiently. */
export type MaskPersistence =
  | 'mutate-geometry'
  | 'preview-only';

export interface BoundaryGeoBundle {
  states: FeatureCollection;
  countries: FeatureCollection;
  lakes: FeatureCollection;
}

export type LandMaskFeature = Feature<Polygon | MultiPolygon>;

export interface ClipOutlookResult {
  feature: LandMaskFeature | null;
  removedAreaRatio: number;
  strategy: LandMaskStrategy;
}
