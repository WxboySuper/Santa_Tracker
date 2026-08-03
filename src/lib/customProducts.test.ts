import type { HostedCustomProduct, CustomCategoryTemplate, OneOffCustomLayer } from '../types/customProducts';
import { CUSTOM_PRODUCT_LIMITS, CUSTOM_PRODUCTS_SCHEMA_VERSION } from '../types/customProducts';
import {
  asCustomLayerId,
  asCustomProductId,
  createEmbeddedCustomProductSnapshot,
  createLayerFromHostedProduct,
  getCustomProductAccessState,
  isCustomCategoryList,
  isCustomCategoryStyle,
  isCustomLayerCollection,
  isCustomPolygonFeature,
  isEmbeddedCustomProductSnapshot,
  isHostedCustomProduct,
  isOneOffCustomLayer,
  reviseHostedCustomProduct,
} from './customProducts';

const category = (overrides: Partial<CustomCategoryTemplate> = {}): CustomCategoryTemplate => ({
  id: 'cat-1' as CustomCategoryTemplate['id'],
  label: 'Elevated hail risk',
  order: 0,
  style: {
    fillColor: '#8a3ffc',
    fillOpacity: 0.35,
    strokeColor: '#4f1f8f',
    strokeOpacity: 1,
    strokeWidth: 2,
    hatch: 'diagonal',
  },
  ...overrides,
});

const product = (overrides: Partial<HostedCustomProduct> = {}): HostedCustomProduct => ({
  schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
  id: asCustomProductId('product-1'),
  userId: 'user-1',
  label: 'Local hail desk',
  description: 'Reusable local categories',
  version: 3,
  status: 'active',
  categories: [category()],
  createdAt: '2026-07-17T12:00:00.000Z',
  updatedAt: '2026-07-17T12:00:00.000Z',
  ...overrides,
});

describe('custom product schema', () => {
  test('accepts a bounded complete category style', () => {
    expect(isCustomCategoryStyle(category().style)).toBe(true);
  });

  test.each([
    { fillColor: 'red' },
    { fillOpacity: 1.1 },
    { strokeOpacity: -0.1 },
    { strokeWidth: 9 },
    { hatch: 'dots' },
    { unknown: true },
  ])('rejects malformed category style %p', (change) => {
    expect(isCustomCategoryStyle({ ...category().style, ...change })).toBe(false);
  });

  test('enforces category count and unique ids/order values', () => {
    expect(isCustomCategoryList([category()])).toBe(true);
    expect(isCustomCategoryList([])).toBe(false);
    expect(isCustomCategoryList([category(), category()])).toBe(false);
    expect(isCustomCategoryList([
      category(),
      category({ id: 'cat-2' as CustomCategoryTemplate['id'], order: 2 }),
    ])).toBe(false);
    expect(isCustomCategoryList(Array.from(
      { length: CUSTOM_PRODUCT_LIMITS.categoriesPerProduct + 1 },
      (_, index) => category({ id: `cat-${index}` as CustomCategoryTemplate['id'], order: index }),
    ))).toBe(false);
  });

  test('validates closed polygon and multipolygon GeoJSON only', () => {
    const base = {
      type: 'Feature',
      properties: { customLayerId: 'layer-1', categoryId: 'cat-1', title: 'Elevated hail risk' },
    } as const;
    expect(isCustomPolygonFeature({
      ...base,
      bbox: [0, 0, 1, 1],
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    }, 'layer-1', new Set(['cat-1']))).toBe(true);
    expect(isCustomPolygonFeature({
      ...base,
      bbox: [0, 0, Number.POSITIVE_INFINITY, 1],
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    })).toBe(false);
    expect(isCustomPolygonFeature({
      ...base,
      id: Number.POSITIVE_INFINITY,
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    })).toBe(false);
    expect(isCustomPolygonFeature({
      ...base,
      bbox: [10, 10, -10, -10],
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    })).toBe(false);
    expect(isCustomPolygonFeature({
      ...base,
      bbox: [0, 0, 1, 1],
      geometry: { type: 'Polygon', coordinates: [[[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 0, 0]]] },
    })).toBe(false);
    expect(isCustomPolygonFeature({
      ...base,
      geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    })).toBe(false);
    expect(isCustomPolygonFeature({
      ...base,
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [2, 2]]] },
    })).toBe(false);
  });

  test('validates hosted product identity, owner, version, limits, and unknown fields', () => {
    expect(isHostedCustomProduct(product())).toBe(true);
    expect(isHostedCustomProduct({ ...product(), userId: '' })).toBe(false);
    expect(isHostedCustomProduct({ ...product(), version: 0 })).toBe(false);
    expect(isHostedCustomProduct({ ...product(), version: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
    expect(isHostedCustomProduct({ ...product(), label: 'x'.repeat(65) })).toBe(false);
    expect(isHostedCustomProduct({ ...product(), internalRole: 'admin' })).toBe(false);
    expect(isHostedCustomProduct({ ...product(), updatedAt: '2026-02-31T12:00:00.000Z' })).toBe(false);
    expect(isHostedCustomProduct({ ...product(), updatedAt: '2026-07-17T11:59:59.999Z' })).toBe(false);
  });

  test('creates a detached immutable-by-value package snapshot', () => {
    const source = product();
    const snapshot = createEmbeddedCustomProductSnapshot(source, '2026-07-17T13:00:00.000Z');
    source.categories[0].label = 'Edited later';
    source.categories[0].style.fillColor = '#000000';

    expect(snapshot.sourceProductVersion).toBe(3);
    expect(snapshot.categories[0].label).toBe('Elevated hail risk');
    expect(snapshot.categories[0].style.fillColor).toBe('#8a3ffc');
    expect(isEmbeddedCustomProductSnapshot(snapshot)).toBe(true);
  });

  test('creates a self-contained empty layer from a product', () => {
    const layer = createLayerFromHostedProduct({
      product: product(),
      layerId: asCustomLayerId('layer-1'),
      order: 2,
      createdAt: '2026-07-17T13:00:00.000Z',
    });
    expect(layer.categories).toEqual(layer.productSnapshot?.categories);
    expect(layer.categories).not.toBe(layer.productSnapshot?.categories);
    expect(layer.features).toEqual([]);
    expect(isOneOffCustomLayer(layer)).toBe(true);
  });

  test('one-off layers need no hosted snapshot and reject mismatched feature identity', () => {
    const layer: OneOffCustomLayer = {
      schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
      id: asCustomLayerId('layer-1'),
      label: 'One-off local layer',
      order: 0,
      categories: [category()],
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        properties: { customLayerId: asCustomLayerId('layer-1'), categoryId: category().id, title: category().label },
      }],
      createdAt: '2026-07-17T13:00:00.000Z',
      updatedAt: '2026-07-17T13:00:00.000Z',
    };
    expect(isOneOffCustomLayer(layer)).toBe(true);
    expect(isOneOffCustomLayer({
      ...layer,
      features: [{ ...layer.features[0], properties: { ...layer.features[0].properties, customLayerId: asCustomLayerId('other') } }],
    })).toBe(false);
    expect(isOneOffCustomLayer({ ...layer, updatedAt: '2026-07-17T12:59:59.999Z' })).toBe(false);
    expect(isCustomLayerCollection({ schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION, layers: [layer] })).toBe(true);
    expect(isCustomLayerCollection({
      schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
      layers: [layer, { ...layer, id: asCustomLayerId('layer-2'), order: 2 }],
    })).toBe(false);
  });

  test('derives active, expired, and archived access without changing snapshots', () => {
    expect(getCustomProductAccessState({ premiumActive: true, status: 'active' })).toEqual({ mode: 'editable' });
    expect(getCustomProductAccessState({ premiumActive: false, status: 'active' })).toEqual({
      mode: 'read-only', reason: 'premium-expired',
    });
    expect(getCustomProductAccessState({ premiumActive: true, status: 'archived' })).toEqual({
      mode: 'read-only', reason: 'archived',
    });
  });

  test('revisions increment stable versions without mutating the old product', () => {
    const original = product();
    const revised = reviseHostedCustomProduct(original, {
      label: 'Revised desk',
      description: undefined,
      categories: [category({ label: 'New category label' })],
      status: 'active',
    }, '2026-07-17T14:00:00.000Z');
    revised.categories[0].style.fillColor = '#ffffff';

    expect(revised.version).toBe(4);
    expect(revised.id).toBe(original.id);
    expect(revised.createdAt).toBe(original.createdAt);
    expect(original.categories[0].style.fillColor).toBe('#8a3ffc');
    expect(isHostedCustomProduct(revised)).toBe(true);
  });

  test('rejects a revision that would exceed the safe integer range', () => {
    expect(() => reviseHostedCustomProduct(product({ version: Number.MAX_SAFE_INTEGER }), {
      label: 'Cannot revise',
      description: undefined,
      categories: [category()],
      status: 'active',
    })).toThrow(RangeError);
    expect(() => reviseHostedCustomProduct(product(), {
      label: '',
      description: undefined,
      categories: [category()],
      status: 'active',
    })).toThrow(TypeError);
    expect(() => reviseHostedCustomProduct(product(), {
      label: 'Moves backward',
      description: undefined,
      categories: [category()],
      status: 'active',
    }, '2026-07-17T11:59:59.999Z')).toThrow(TypeError);
    expect(() => createLayerFromHostedProduct({
      product: product({ label: '' }),
      layerId: asCustomLayerId('layer-invalid'),
      order: 0,
    })).toThrow(TypeError);
  });
});
