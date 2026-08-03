import type { Feature, MultiPolygon, Polygon } from 'geojson';

/** Serialized schema version for custom layer/product data. */
export const CUSTOM_PRODUCTS_SCHEMA_VERSION = '1.0.0' as const;

/** Product limits shared by client validation and hosted persistence. */
export const CUSTOM_PRODUCT_LIMITS = {
  productsPerAccount: 20,
  layersPerCollection: 12,
  categoriesPerProduct: 12,
  featuresPerLayer: 500,
  polygonsPerFeature: 32,
  ringsPerPolygon: 64,
  coordinatesPerFeature: 10_000,
  labelLength: 64,
} as const;

export type CustomLayerId = string & { readonly _brand: 'CustomLayerId' };
export type CustomCategoryId = string & { readonly _brand: 'CustomCategoryId' };
export type CustomProductId = string & { readonly _brand: 'CustomProductId' };

export type CustomHatchPattern = 'none' | 'diagonal' | 'reverse-diagonal' | 'crosshatch';

/** Complete visual treatment for one custom forecast category. */
export interface CustomCategoryStyle {
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeOpacity: number;
  strokeWidth: number;
  hatch: CustomHatchPattern;
}

/** Ordered, reusable category definition embedded into layers and products. */
export interface CustomCategoryTemplate {
  id: CustomCategoryId;
  label: string;
  order: number;
  style: CustomCategoryStyle;
}

export interface CustomFeatureProperties {
  customLayerId: CustomLayerId;
  categoryId: CustomCategoryId;
  /** Copied label makes exported GeoJSON understandable without a template lookup. */
  title: string;
}

export type CustomPolygonFeature = Feature<Polygon | MultiPolygon, CustomFeatureProperties>;

/** Immutable record of the product/category version used to create a map. */
export interface EmbeddedCustomProductSnapshot {
  schemaVersion: typeof CUSTOM_PRODUCTS_SCHEMA_VERSION;
  sourceProductId?: CustomProductId;
  sourceProductVersion?: number;
  label: string;
  categories: CustomCategoryTemplate[];
  capturedAt: string;
}

/** A self-contained custom layer; no hosted product is required to render it. */
export interface OneOffCustomLayer {
  schemaVersion: typeof CUSTOM_PRODUCTS_SCHEMA_VERSION;
  id: CustomLayerId;
  label: string;
  order: number;
  categories: CustomCategoryTemplate[];
  features: CustomPolygonFeature[];
  /** Present when the layer was seeded from a reusable hosted product. */
  productSnapshot?: EmbeddedCustomProductSnapshot;
  createdAt: string;
  updatedAt: string;
}

export type HostedCustomProductStatus = 'active' | 'archived';

/** Owner-scoped, versioned category template stored in Firestore. */
export interface HostedCustomProduct {
  schemaVersion: typeof CUSTOM_PRODUCTS_SCHEMA_VERSION;
  id: CustomProductId;
  userId: string;
  label: string;
  description?: string;
  version: number;
  status: HostedCustomProductStatus;
  categories: CustomCategoryTemplate[];
  createdAt: string;
  updatedAt: string;
}

export type CustomProductReadOnlyReason = 'premium-expired' | 'archived';

/** Runtime access state derived from entitlement and product lifecycle. */
export type CustomProductAccessState =
  | { mode: 'editable'; reason?: never }
  | { mode: 'read-only'; reason: CustomProductReadOnlyReason };

/** Custom content persisted with a cycle/package. */
export interface CustomLayerCollection {
  schemaVersion: typeof CUSTOM_PRODUCTS_SCHEMA_VERSION;
  layers: OneOffCustomLayer[];
}
