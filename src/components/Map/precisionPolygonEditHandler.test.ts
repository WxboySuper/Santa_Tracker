jest.mock('./openLayersMapStyles', () => ({
  toUpdatedCustomFeature: jest.fn(),
  toUpdatedGeoJsonFeature: jest.fn(),
}));

import type OLFeature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import {
  toUpdatedCustomFeature,
  toUpdatedGeoJsonFeature,
} from './openLayersMapStyles';
import { dispatchModifyUpdates } from './precisionPolygonEditHandler';

const mockedToCustom = jest.mocked(toUpdatedCustomFeature);
const mockedToOutlook = jest.mocked(toUpdatedGeoJsonFeature);

const createFeatureStub = (overrides: Record<string, unknown> = {}) => ({
  get: (key: string) => overrides[key],
}) as OLFeature<Geometry>;

describe('precisionPolygonEditHandler', () => {
  beforeEach(() => {
    mockedToCustom.mockReset();
    mockedToOutlook.mockReset();
  });

  it('batches outlook geometry updates into one undo step', () => {
    mockedToCustom.mockReturnValue(null);
    mockedToOutlook.mockReturnValue({
      type: 'Feature',
      id: 'feature-1',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: { outlookType: 'tornado', probability: '2%' },
    });

    const dispatch = jest.fn();
    dispatchModifyUpdates({
      features: [createFeatureStub(), createFeatureStub()],
      format: {} as never,
      isCategorical: false,
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: 'forecast/updateFeaturesBatch',
    });
  });

  it('skips auto-generated categorical features', () => {
    mockedToCustom.mockReturnValue(null);
    mockedToOutlook.mockReturnValue({
      type: 'Feature',
      id: 'feature-1',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: { outlookType: 'categorical', probability: 'SLGT' },
    });

    const dispatch = jest.fn();
    dispatchModifyUpdates({
      features: [createFeatureStub({ derivedFrom: 'auto-generated' })],
      format: {} as never,
      isCategorical: true,
      dispatch,
    });

    expect(dispatch).not.toHaveBeenCalled();
  });
});
