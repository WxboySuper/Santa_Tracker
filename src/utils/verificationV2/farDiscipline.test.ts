import type { GridEvaluation } from './gridEvaluation';
import { scoreFalseAlarmDiscipline } from './farDiscipline';

const evaluation = (overrides: Partial<GridEvaluation>): GridEvaluation => ({
  forecast: [0, 0],
  observed: [0, 0],
  observedFrequency: 0,
  forecastCellCount: 0,
  cellCount: 2,
  ...overrides,
});

describe('scoreFalseAlarmDiscipline', () => {
  it('returns not evaluated when no forecast probability paint exists', () => {
    const result = scoreFalseAlarmDiscipline(evaluation({ forecast: [0, 0], observed: [0, 0] }));
    expect(result.applicable).toBe(false);
    expect(result.score).toBeNull();
    expect(result.key).toBe('farDiscipline');
  });

  it('scores 1 for all-hit forecasts', () => {
    const result = scoreFalseAlarmDiscipline(
      evaluation({
        forecast: [0.3, 0.5],
        observed: [1, 1],
        forecastCellCount: 2,
        observedFrequency: 1,
      })
    );

    expect(result.applicable).toBe(true);
    expect(result.score).toBe(1);
    expect(result.metrics?.far).toBe(0);
    expect(result.metrics?.weightedHit).toBeCloseTo(0.8, 5);
    expect(result.metrics?.weightedFalseAlarm).toBe(0);
  });

  it('scores 0 for all-false-alarm forecasts', () => {
    const result = scoreFalseAlarmDiscipline(
      evaluation({
        forecast: [0.3, 0.5],
        observed: [0, 0],
        forecastCellCount: 2,
        observedFrequency: 0,
      })
    );

    expect(result.applicable).toBe(true);
    expect(result.score).toBe(0);
    expect(result.metrics?.far).toBe(1);
    expect(result.metrics?.weightedFalseAlarm).toBeCloseTo(0.8, 5);
    expect(result.metrics?.weightedHit).toBe(0);
  });

  it('weights the FAR by probability for mixed inputs', () => {
    const result = scoreFalseAlarmDiscipline(
      evaluation({
        forecast: [0.3, 0.7, 0.2, 0],
        observed: [1, 0, 0, 0],
        forecastCellCount: 3,
        cellCount: 4,
        observedFrequency: 0.25,
      })
    );

    expect(result.applicable).toBe(true);
    const weightedHit = 0.3;
    const weightedFalseAlarm = 0.9;
    const far = weightedFalseAlarm / (weightedHit + weightedFalseAlarm);
    expect(result.metrics?.far).toBeCloseTo(far, 5);
    expect(result.score).toBeCloseTo(1 - far, 5);
  });

  it('ignores zero-probability cells when computing weighted FAR', () => {
    const result = scoreFalseAlarmDiscipline(
      evaluation({
        forecast: [0, 0.4, 0, 0.6],
        observed: [0, 0, 0, 1],
        forecastCellCount: 2,
        cellCount: 4,
        observedFrequency: 0.25,
      })
    );

    expect(result.applicable).toBe(true);
    expect(result.metrics?.weightedHit).toBeCloseTo(0.6, 5);
    expect(result.metrics?.weightedFalseAlarm).toBeCloseTo(0.4, 5);
    expect(result.metrics?.far).toBeCloseTo(0.4, 5);
    expect(result.score).toBeCloseTo(0.6, 5);
  });
});
