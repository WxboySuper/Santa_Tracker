import { handlePaintBucketMapClick } from './paintBucketMapInteraction';
import { resolvePaintBucketEditAction } from '../../utils/paintBucket/outlookScope';

describe('paintBucketMapInteraction helpers', () => {
  test('assign mode ignores shift and always recategorizes', () => {
    expect(resolvePaintBucketEditAction('assign', true)).toBe('recategorize');
    expect(resolvePaintBucketEditAction('assign', false)).toBe('recategorize');
  });

  test('step mode uses shift for step-down', () => {
    expect(resolvePaintBucketEditAction('step', false)).toBe('step-up');
    expect(resolvePaintBucketEditAction('step', true)).toBe('step-down');
  });

  test('step mode supports a visible down direction for touch input', () => {
    expect(resolvePaintBucketEditAction('step', false, 'down')).toBe('step-down');
    expect(resolvePaintBucketEditAction('assign', false, 'down')).toBe('recategorize');
  });

  test('full map flow selects the topmost nested same-pixel polygon', () => {
    const vectorLayer = {} as never;
    const selectedFeature = {
      get: (key: string) => ({
        featureId: 'ten-percent',
        outlookType: 'tornado',
        probability: '10%',
      }[key]),
    };
    const map = {
      forEachFeatureAtPixel: jest.fn((pixel, callback) => {
        callback(selectedFeature, vectorLayer);
      }),
    } as never;
    const dispatch = jest.fn();

    expect(handlePaintBucketMapClick({
      map,
      pixel: [10, 10],
      vectorLayer,
      dispatch,
      outlookType: 'tornado',
      currentDay: 1,
      mode: 'step',
      shiftKey: false,
      activeProbability: '2%',
    })).toBe(true);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: expect.stringContaining('applyPaintBucketEdit'),
      payload: expect.objectContaining({ featureId: 'ten-percent', fromProbability: '10%' }),
    }));
  });
});
