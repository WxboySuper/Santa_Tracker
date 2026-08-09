import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import type { Feature as GeoJsonFeature, Polygon } from 'geojson';
import {
  reconcileFeatureSource,
  type FeatureSyncDescriptor,
  type FeatureSyncStats,
} from '../components/Map/openLayersFeatureSync';
import { measure, reportComparison } from './benchmarkUtils';

const createFeature = (id: string, offset: number): GeoJsonFeature<Polygon> => ({
  type: 'Feature',
  id,
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [offset, offset],
      [offset + 1, offset],
      [offset + 1, offset + 1],
      [offset, offset + 1],
      [offset, offset],
    ]],
  },
  properties: { outlookType: 'tornado', probability: '2%' },
});

const createDescriptor = (
  feature: GeoJsonFeature<Polygon>,
  format: GeoJSON,
): FeatureSyncDescriptor => ({
  key: `normal:${String(feature.id)}`,
  feature,
  signature: 'tornado|2%',
  read: () => format.readFeature(feature, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  }),
  apply: (olFeature) => {
    olFeature.set('featureId', feature.id);
    olFeature.set('outlookType', 'tornado');
    olFeature.set('probability', '2%');
  },
});

const createStats = (): FeatureSyncStats => ({
  parsed: 0,
  added: 0,
  updated: 0,
  removed: 0,
  reused: 0,
});

const normalizeReadResult = (
  result: ReturnType<FeatureSyncDescriptor['read']>,
) => (Array.isArray(result) ? result : [result]);

/** Reproduces the former source.clear plus full GeoJSON reparse path. */
const reconcileLegacySource = (
  source: VectorSource,
  descriptors: FeatureSyncDescriptor[],
): void => {
  source.clear();
  const parsedFeatures = descriptors.flatMap((descriptor) => {
    const parsed = normalizeReadResult(descriptor.read());
    parsed.forEach((feature) => descriptor.apply(feature));
    return parsed;
  });
  source.addFeatures(parsedFeatures);
};

describe('OpenLayers feature synchronization performance', () => {
  test('compares incremental reconciliation with the former full reparse path', () => {
    if (process.env.GFC_PERF !== '1') return;

    const format = new GeoJSON();
    const initialFeatures = Array.from(
      { length: 256 },
      (_, index) => createFeature(`feature-${index}`, index),
    );
    const scenarios = Array.from({ length: 100 }, (_, index) => {
      const changedFeature = createFeature('feature-128', 1000 + index);
      return initialFeatures.map((feature) =>
        feature.id === changedFeature.id
          ? createDescriptor(changedFeature, format)
          : createDescriptor(feature, format),
      );
    });
    const initialDescriptors = initialFeatures.map((feature) => createDescriptor(feature, format));

    const optimizedSource = new VectorSource();
    reconcileFeatureSource(optimizedSource, initialDescriptors);
    const firstFeature = optimizedSource.getFeatureById('feature-128');
    const stats = createStats();
    reconcileFeatureSource(optimizedSource, scenarios[0] || [], stats);

    expect(stats.parsed).toBe(1);
    expect(stats.reused).toBe(255);
    expect(stats.updated).toBe(1);
    expect(optimizedSource.getFeatureById('feature-128')).toBe(firstFeature);

    const baselineSource = new VectorSource();
    reconcileLegacySource(baselineSource, initialDescriptors);

    let optimizedScenario = 0;
    const optimized = measure(() => {
      reconcileFeatureSource(
        optimizedSource,
        scenarios[optimizedScenario % scenarios.length] || [],
      );
      optimizedScenario += 1;
    }, { iterations: 100, samples: 5, warmup: 2 });

    let baselineScenario = 0;
    const baseline = measure(() => {
      reconcileLegacySource(
        baselineSource,
        scenarios[baselineScenario % scenarios.length] || [],
      );
      baselineScenario += 1;
    }, { iterations: 100, samples: 5, warmup: 2 });

    reportComparison('OpenLayers sync (256 features, one edit)', baseline, optimized);
  });
});
