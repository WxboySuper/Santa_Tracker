import { circleContour, makeReport } from './testFixtures';
import { scoreTierPlacement } from './tierPlacement';

describe('scoreTierPlacement', () => {
  test('gives broad low-probability coverage bounded credit without area punishment', () => {
    const result = scoreTierPlacement(
      'tornado',
      [{ probability: 0.02, isSignificant: false, polygon: circleContour(-97, 37, 100) }],
      [makeReport('tornado', -97, 37), makeReport('tornado', -105, 37)]
    );

    expect(result.applicable).toBe(true);
    expect(result.score).toBeCloseTo(0.5, 5);
    expect(result.metrics).toEqual({
      captured: 1,
      total: 2,
      lowRiskCoverage: 0.5,
      placementScore: 0.5,
    });
  });

  test('caps a low-probability all-captured forecast below perfect', () => {
    const result = scoreTierPlacement(
      'tornado',
      [{ probability: 0.02, isSignificant: false, polygon: circleContour(-97, 37, 100) }],
      [makeReport('tornado', -97, 37)]
    );

    expect(result.score).toBeCloseTo(0.65, 5);
  });

  test('uses softened spatial contingency for 15%+ cores', () => {
    const result = scoreTierPlacement(
      'tornado',
      [{ probability: 0.15, isSignificant: false, polygon: circleContour(-97, 37, 40) }],
      [makeReport('tornado', -97, 37)]
    );

    expect(result.applicable).toBe(true);
    expect(result.score as number).toBeGreaterThan(0);
    expect(result.score as number).toBeLessThanOrEqual(1);
    expect(result.metrics?.rawCoreCsi).toBeDefined();
  });

  test('scores an empty high-probability core as zero placement', () => {
    const result = scoreTierPlacement(
      'tornado',
      [{ probability: 0.3, isSignificant: false, polygon: circleContour(-97, 37, 100) }],
      []
    );

    expect(result).toEqual(expect.objectContaining({ applicable: true, score: 0 }));
  });
});
