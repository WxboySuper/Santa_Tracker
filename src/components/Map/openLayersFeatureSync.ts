import type Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import type VectorSource from "ol/source/Vector";
import type { Feature as GeoJsonFeature } from "geojson";

const RENDER_KEY = "__gfcRenderKey";
const SOURCE_FEATURE = "__gfcSourceFeature";
const RENDER_SIGNATURE = "__gfcRenderSignature";

export type FeatureSyncDescriptor = {
  key: string;
  feature: GeoJsonFeature;
  signature: string;
  read: () => Feature<Geometry> | Feature<Geometry>[];
  apply: (feature: Feature<Geometry>) => void;
  targetSource?: VectorSource;
};

export type FeatureSyncStats = {
  parsed: number;
  added: number;
  updated: number;
  removed: number;
  reused: number;
};

const increment = (
  stats: FeatureSyncStats | undefined,
  property: keyof FeatureSyncStats,
  amount = 1,
): void => {
  if (stats) {
    stats[property] += amount;
  }
};

const normalizeReadResult = (
  result: Feature<Geometry> | Feature<Geometry>[],
): Feature<Geometry>[] => (Array.isArray(result) ? result : [result]);

const trackFeature = (
  feature: Feature<Geometry>,
  descriptor: FeatureSyncDescriptor,
  partIndex: number,
): void => {
  feature.set(RENDER_KEY, `${descriptor.key}:${partIndex}`);
  feature.set(SOURCE_FEATURE, descriptor.feature);
  feature.set(RENDER_SIGNATURE, descriptor.signature);
};

/** Reconciles one OL source while retaining feature identity for unchanged GeoJSON inputs. */
export const reconcileFeatureSource = (
  source: VectorSource,
  descriptors: FeatureSyncDescriptor[],
  stats?: FeatureSyncStats,
): void => {
  const existingByKey = new Map<string, Feature<Geometry>[]>();
  const unmanagedFeatures: Feature<Geometry>[] = [];

  source.getFeatures().forEach((feature) => {
    const renderKey = feature.get(RENDER_KEY);
    if (typeof renderKey !== "string") {
      unmanagedFeatures.push(feature);
      return;
    }

    const descriptorKey = renderKey.slice(0, renderKey.lastIndexOf(":"));
    const features = existingByKey.get(descriptorKey) || [];
    features.push(feature);
    existingByKey.set(descriptorKey, features);
  });

  const desiredKeys = new Set<string>();

  descriptors.forEach((descriptor) => {
    desiredKeys.add(descriptor.key);
    const existing = existingByKey.get(descriptor.key) || [];
    const canReuse =
      existing.length > 0 &&
      existing.every(
        (feature) =>
          feature.get(SOURCE_FEATURE) === descriptor.feature &&
          feature.get(RENDER_SIGNATURE) === descriptor.signature,
      );

    if (canReuse) {
      increment(stats, "reused", existing.length);
      return;
    }

    const parsedFeatures = normalizeReadResult(descriptor.read());
    increment(stats, "parsed");
    const sharedFeatureCount = Math.min(existing.length, parsedFeatures.length);

    for (let index = 0; index < sharedFeatureCount; index += 1) {
      const currentFeature = existing[index];
      const parsedFeature = parsedFeatures[index];
      currentFeature.setGeometry(parsedFeature.getGeometry());
      descriptor.apply(currentFeature);
      trackFeature(currentFeature, descriptor, index);
      increment(stats, "updated");
    }

    for (let index = sharedFeatureCount; index < parsedFeatures.length; index += 1) {
      const newFeature = parsedFeatures[index];
      descriptor.apply(newFeature);
      trackFeature(newFeature, descriptor, index);
      source.addFeature(newFeature);
      increment(stats, "added");
    }

    for (let index = sharedFeatureCount; index < existing.length; index += 1) {
      source.removeFeature(existing[index]);
      increment(stats, "removed");
    }
  });

  existingByKey.forEach((features, key) => {
    if (desiredKeys.has(key)) {
      return;
    }

    features.forEach((feature) => {
      source.removeFeature(feature);
      increment(stats, "removed");
    });
  });

  unmanagedFeatures.forEach((feature) => {
    source.removeFeature(feature);
    increment(stats, "removed");
  });
};
