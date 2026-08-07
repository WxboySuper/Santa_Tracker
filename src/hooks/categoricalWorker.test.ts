import { createDerivationController } from './categoricalWorker';
import type { OutlookData } from '../types/outlooks';
import * as processing from './autoCategoricalProcessing';

const makeFeature = (id: string): GeoJSON.Feature => ({
  type: 'Feature',
  id,
  geometry: {
    type: 'Polygon',
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
  },
  properties: { outlookType: 'tornado', probability: '30%' },
});

const emptyOutlooks = (): OutlookData => ({
  tornado: new Map(),
  wind: new Map(),
  hail: new Map(),
  categorical: new Map(),
});

describe('createDerivationController', () => {
  it('derives categorical features via the synchronous fallback in test environments', async () => {
    const controller = createDerivationController();
    const outlooks: OutlookData = {
      ...emptyOutlooks(),
      tornado: new Map([['30%', [makeFeature('t1')]]]),
    };

    const result = await controller.derive(1, 1, outlooks);
    expect(result.ok).toBe(true);
    expect(result.features?.length).toBeGreaterThan(0);
    controller.dispose();
  });

  it('returns an error result when derivation throws', async () => {
    const controller = createDerivationController();
    const spy = jest.spyOn(processing, 'processDay12OutlooksToCategorical')
      .mockImplementation(() => { throw new Error('derivation exploded'); });

    try {
      const result = await controller.derive(2, 1, emptyOutlooks());
      expect(result.ok).toBe(false);
      expect(result.error).toContain('derivation exploded');
    } finally {
      spy.mockRestore();
    }
    controller.dispose();
  });

  it('dispose is safe and does not break subsequent derivation in the sync fallback', async () => {
    const controller = createDerivationController();
    const outlooks: OutlookData = {
      ...emptyOutlooks(),
      tornado: new Map([['30%', [makeFeature('t1')]]]),
    };

    controller.dispose();
    const result = await controller.derive(3, 1, outlooks);
    expect(result.ok).toBe(true);
  });
});
