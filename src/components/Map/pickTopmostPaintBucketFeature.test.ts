import type OLFeature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import { pickTopmostPaintBucketFeature } from './pickTopmostPaintBucketFeature';

const createFeatureStub = (outlookType: string, probability: string) => ({
  get: (key: string) => {
    if (key === 'outlookType') return outlookType;
    if (key === 'probability') return probability;
    return undefined;
  },
}) as OLFeature<Geometry>;

describe('pickTopmostPaintBucketFeature', () => {
  test('selects the highest-risk feature at a pixel', () => {
    const low = createFeatureStub('tornado', '2%');
    const high = createFeatureStub('tornado', '15%');
    const vectorLayer = {};

    const map = {
      forEachFeatureAtPixel: (
        _pixel: number[],
        callback: (feature: OLFeature<Geometry>, layer: unknown) => boolean | void,
        options?: { layerFilter?: (layer: unknown) => boolean },
      ) => {
        if (options?.layerFilter && !options.layerFilter(vectorLayer)) {
          return undefined;
        }
        callback(low, vectorLayer);
        callback(high, vectorLayer);
        return undefined;
      },
    };

    const picked = pickTopmostPaintBucketFeature(
      map as never,
      [0, 0],
      vectorLayer as never,
    );

    expect(picked).toBe(high);
  });
});
