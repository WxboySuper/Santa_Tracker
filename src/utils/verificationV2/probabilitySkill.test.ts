import type { GridEvaluation } from './gridEvaluation';
import { scoreProbabilitySkill } from './probabilitySkill';

const evaluation = (overrides: Partial<GridEvaluation>): GridEvaluation => ({
  forecast: [0, 0, 0, 0],
  observed: [0, 0, 0, 0],
  observedFrequency: 0,
  forecastCellCount: 0,
  cellCount: 4,
  ...overrides,
});

const expectScored = (
  result: ReturnType<typeof scoreProbabilitySkill>,
  expectedScore: number
) => {
  expect(result.applicable).toBe(true);
  expect(result.score).toBe(expectedScore);
};

describe('scoreProbabilitySkill', () => {
  it('returns not evaluated when the evaluation has no data', () => {
    const result = scoreProbabilitySkill(
      evaluation({ cellCount: 0, forecast: [], observed: [] })
    );
    expect(result.applicable).toBe(false);
    expect(result.score).toBeNull();
    expect(result.key).toBe('probabilitySkill');
  });

  it.each([
    {
      name: 'overforecast (zero observed frequency)',
      eval: evaluation({
        forecast: [0.3, 0.4, 0.2, 0.1],
        observed: [0, 0, 0, 0],
        forecastCellCount: 4,
        observedFrequency: 0,
      }),
      expectedScore: 0,
      check: (result: ReturnType<typeof scoreProbabilitySkill>) => {
        expect(result.metrics?.observedFrequency).toBe(0);
        expect(result.metrics?.brier).toBeCloseTo(0.075, 5);
      },
    },
    {
      name: 'one-climatology (always observed)',
      eval: evaluation({
        forecast: [0.5, 0.5, 0.5, 0.5],
        observed: [1, 1, 1, 1],
        forecastCellCount: 4,
        observedFrequency: 1,
      }),
      expectedScore: 0,
      check: (result: ReturnType<typeof scoreProbabilitySkill>) => {
        expect(result.metrics?.observedFrequency).toBe(1);
      },
    },
    {
      name: 'negative BSS clamped to zero',
      eval: evaluation({
        forecast: [0, 0, 0, 0],
        observed: [1, 1, 1, 1],
        forecastCellCount: 0,
        observedFrequency: 1,
      }),
      expectedScore: 0,
      check: () => undefined,
    },
  ])('scores $name at zero', ({ eval: ev, expectedScore, check }) => {
    const result = scoreProbabilitySkill(ev);
    expectScored(result, expectedScore);
    check(result);
  });

  it('rewards a perfect forecast with BSS 1', () => {
    const result = scoreProbabilitySkill(
      evaluation({
        forecast: [1, 1, 0, 0],
        observed: [1, 1, 0, 0],
        forecastCellCount: 2,
        observedFrequency: 0.5,
      })
    );

    expectScored(result, 1);
    expect(result.metrics?.brier).toBe(0);
    expect(result.metrics?.bss).toBe(1);
  });

  it('computes BSS for a partial-skill forecast', () => {
    const result = scoreProbabilitySkill(
      evaluation({
        forecast: [0.1, 0.2, 0.3, 0.4],
        observed: [0, 0, 0, 1],
        forecastCellCount: 4,
        observedFrequency: 0.25,
      })
    );

    expectScored(result, 1 - 0.125 / (0.25 * 0.75));
    expect(result.metrics?.brier).toBeCloseTo(0.125, 3);
    expect(result.metrics?.bss).toBeCloseTo(1 - 0.125 / (0.25 * 0.75), 3);
  });
});
