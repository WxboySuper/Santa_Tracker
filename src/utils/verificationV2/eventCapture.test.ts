import { circleContour, makeReport } from './testFixtures';
import { scoreEventCapture } from './eventCapture';

describe('scoreEventCapture', () => {
  const contour = circleContour(-97, 37, 100);

  test('gives full capture credit when every relevant report is covered', () => {
    const component = scoreEventCapture('tornado', [{
      probability: 0.02,
      isSignificant: false,
      polygon: contour,
    }], [
      makeReport('tornado', -97, 37),
      makeReport('tornado', -97.5, 37.2),
    ]);

    expect(component).toEqual(expect.objectContaining({ applicable: true, score: 1 }));
    expect(component.metrics).toEqual({ captured: 2, missed: 0, total: 2 });
  });

  test('credits a broad low-probability area for covered events without area penalty', () => {
    const component = scoreEventCapture('tornado', [{
      probability: 0.02,
      isSignificant: false,
      polygon: contour,
    }], [
      makeReport('tornado', -97, 37),
      makeReport('tornado', -105, 37),
    ]);

    expect(component).toEqual(expect.objectContaining({ applicable: true, score: 0.5 }));
    expect(component.metrics).toEqual({ captured: 1, missed: 1, total: 2 });
  });

  test('does not invent a single-case capture score when no relevant events occurred', () => {
    const component = scoreEventCapture('tornado', [{
      probability: 0.15,
      isSignificant: false,
      polygon: contour,
    }], [makeReport('hail', -97, 37)]);

    expect(component).toEqual(expect.objectContaining({ applicable: false, score: null }));
  });
});
