import GeoJSON from "ol/format/GeoJSON";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorSource from "ol/source/Vector";
import type OLFeature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import type { Feature as GeoJsonFeature, Polygon } from "geojson";
import {
  getForecastSourceDescriptorPlan,
  reconcileFeatureSource,
  type FeatureSyncDescriptor,
  type FeatureSyncStats,
} from "./openLayersFeatureSync";

const createFeature = (id: string, offset: number): GeoJsonFeature<Polygon> => ({
  type: "Feature",
  id,
  geometry: {
    type: "Polygon",
    coordinates: [[
      [offset, offset],
      [offset + 1, offset],
      [offset + 1, offset + 1],
      [offset, offset + 1],
      [offset, offset],
    ]],
  },
  properties: { outlookType: "tornado", probability: "2%" },
});

const createDescriptor = (
  feature: GeoJsonFeature<Polygon>,
  format: GeoJSON,
): FeatureSyncDescriptor => ({
  key: `normal:${String(feature.id)}`,
  feature,
  signature: "tornado|2%",
  read: () => format.readFeature(feature, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  }),
  apply: (olFeature) => {
    olFeature.set("featureId", feature.id);
    olFeature.set("outlookType", "tornado");
    olFeature.set("probability", "2%");
  },
});

const createMultiPartDescriptor = (
  feature: GeoJsonFeature<Polygon>,
  format: GeoJSON,
  offsets: number[],
): FeatureSyncDescriptor => ({
  ...createDescriptor(feature, format),
  read: () => offsets.map((offset, partIndex) => format.readFeature(
    createFeature(`${String(feature.id)}-part-${partIndex}`, offset),
    {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    },
  ) as OLFeature<Geometry>),
});

const createStats = (): FeatureSyncStats => ({
  parsed: 0,
  added: 0,
  updated: 0,
  removed: 0,
  reused: 0,
});

describe("reconcileFeatureSource", () => {
  test("reuses unchanged features and updates changed geometry in place", () => {
    const source = new VectorSource();
    const format = new GeoJSON();
    const first = createFeature("first", 0);
    const second = createFeature("second", 2);
    const initialStats = createStats();

    reconcileFeatureSource(
      source,
      [createDescriptor(first, format), createDescriptor(second, format)],
      initialStats,
    );

    const firstOlFeature = source.getFeatures()[0];
    const secondOlFeature = source.getFeatures()[1];
    expect(initialStats).toEqual({ parsed: 2, added: 2, updated: 0, removed: 0, reused: 0 });

    const changedFirst = createFeature("first", 10);
    const updateStats = createStats();
    reconcileFeatureSource(
      source,
      [createDescriptor(changedFirst, format), createDescriptor(second, format)],
      updateStats,
    );

    expect(updateStats).toEqual({ parsed: 1, added: 0, updated: 1, removed: 0, reused: 1 });
    expect(source.getFeatureById("first")).toBe(firstOlFeature);
    expect(source.getFeatureById("second")).toBe(secondOlFeature);
    expect(firstOlFeature?.getGeometry()?.getExtent()[0]).toBeGreaterThan(0);
  });

  test("only parses one feature during a representative large-forecast edit", () => {
    const source = new VectorSource();
    const format = new GeoJSON();
    const features = Array.from({ length: 256 }, (_, index) => createFeature(`feature-${index}`, index));
    reconcileFeatureSource(source, features.map((feature) => createDescriptor(feature, format)));

    const changedFeature = createFeature("feature-128", 1000);
    const stats = createStats();
    reconcileFeatureSource(
      source,
      features.map((feature) =>
        feature.id === changedFeature.id ? createDescriptor(changedFeature, format) : createDescriptor(feature, format),
      ),
      stats,
    );

    expect(stats.parsed).toBe(1);
    expect(stats.updated).toBe(1);
    expect(stats.reused).toBe(255);
    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(0);
  });

  test("adds and removes features as the desired set changes", () => {
    const source = new VectorSource();
    const format = new GeoJSON();
    const first = createFeature("first", 0);
    const second = createFeature("second", 2);
    reconcileFeatureSource(source, [createDescriptor(first, format)]);

    const stats = createStats();
    reconcileFeatureSource(source, [createDescriptor(second, format)], stats);

    expect(stats).toEqual({ parsed: 1, added: 1, updated: 0, removed: 1, reused: 0 });
    expect(source.getFeatures()).toHaveLength(1);
    expect(source.getFeatures()[0]?.get("featureId")).toBe("second");
  });

  test("removes unmanaged transient features like the former clear path", () => {
    const source = new VectorSource();
    const transient = new Feature({ geometry: new Point([0, 0]) });
    source.addFeature(transient);
    const stats = createStats();

    reconcileFeatureSource(source, [], stats);

    expect(stats).toEqual({ parsed: 0, added: 0, updated: 0, removed: 1, reused: 0 });
    expect(source.getFeatures()).toEqual([]);
  });

  test("partitions normal and categorical descriptors by map mode", () => {
    const source = new VectorSource();
    const categoricalSource = new VectorSource();
    const format = new GeoJSON();
    const normal = { ...createDescriptor(createFeature("normal", 0), format), targetSource: source };
    const categorical = {
      ...createDescriptor(createFeature("categorical", 2), format),
      targetSource: categoricalSource,
    };
    const custom = { ...createDescriptor(createFeature("custom", 4), format), targetSource: source };

    expect(getForecastSourceDescriptorPlan({
      normalDescriptors: [normal, categorical],
      customMode: false,
      customDescriptors: [custom],
      source,
      categoricalSource,
    })).toEqual({ source: [normal], categorical: [categorical] });
    expect(getForecastSourceDescriptorPlan({
      normalDescriptors: [normal, categorical],
      customMode: true,
      customDescriptors: [custom],
      source,
      categoricalSource,
    })).toEqual({ source: [custom], categorical: [] });
  });

  test("preserves feature identity when descriptors are reordered", () => {
    const source = new VectorSource();
    const format = new GeoJSON();
    const first = createFeature("first", 0);
    const second = createFeature("second", 2);
    reconcileFeatureSource(source, [
      createDescriptor(first, format),
      createDescriptor(second, format),
    ]);

    const firstOlFeature = source.getFeatureById("first");
    const secondOlFeature = source.getFeatureById("second");
    const stats = createStats();
    reconcileFeatureSource(source, [
      createDescriptor(second, format),
      createDescriptor(first, format),
    ], stats);

    expect(stats).toEqual({ parsed: 0, added: 0, updated: 0, removed: 0, reused: 2 });
    expect(source.getFeatureById("first")).toBe(firstOlFeature);
    expect(source.getFeatureById("second")).toBe(secondOlFeature);
  });

  test("removes stale parts when a feature changes geometry part count", () => {
    const source = new VectorSource();
    const format = new GeoJSON();
    const initialFeature = createFeature("multi", 0);
    reconcileFeatureSource(source, [
      createMultiPartDescriptor(initialFeature, format, [0, 2]),
    ]);

    const initialParts = source.getFeatures();
    const stats = createStats();
    reconcileFeatureSource(source, [
      createMultiPartDescriptor(createFeature("multi", 10), format, [10]),
    ], stats);

    expect(stats).toEqual({ parsed: 1, added: 0, updated: 1, removed: 1, reused: 0 });
    expect(source.getFeatures()).toHaveLength(1);
    expect(source.getFeatures()[0]).toBe(initialParts[0]);
    expect(source.getFeatures()[0]?.getGeometry()?.getExtent()[0]).toBeGreaterThan(0);
  });

  test("rejects descriptors without stable feature ids", () => {
    const source = new VectorSource();
    const format = new GeoJSON();
    const feature = { ...createFeature("missing-id", 0), id: undefined };

    expect(() => reconcileFeatureSource(source, [createDescriptor(feature, format)])).toThrow(
      "requires a feature id",
    );
  });

  test("rejects duplicate descriptor keys to protect feature identity", () => {
    const source = new VectorSource();
    const format = new GeoJSON();
    const first = createDescriptor(createFeature("first", 0), format);
    const duplicate = { ...createDescriptor(createFeature("second", 2), format), key: first.key };

    expect(() => reconcileFeatureSource(source, [first, duplicate])).toThrow(
      "unique non-empty keys",
    );
  });

  test("accepts an explicit fallback identity for legacy features", () => {
    const source = new VectorSource();
    const format = new GeoJSON();
    const feature = { ...createFeature("missing-id", 0), id: undefined };

    expect(() => reconcileFeatureSource(source, [{
      ...createDescriptor(feature, format),
      key: "normal:legacy-index-0",
      stableId: "legacy-index-0",
    }])).not.toThrow();
    expect(source.getFeatures()).toHaveLength(1);
  });
});
