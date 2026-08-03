import { clamp, notEvaluatedComponent, scoredComponent, type ComponentScore } from './gradeContract';
import { type GridEvaluation, isGradableEvaluation, roundTo } from './gridEvaluation';

const brierScore = (forecast: number[], observed: number[], cellCount: number): number => {
  let squaredError = 0;
  for (let index = 0; index < cellCount; index += 1) {
    const diff = forecast[index] - observed[index];
    squaredError += diff * diff;
  }
  return squaredError / cellCount;
};

const brierSkillScore = (brier: number, observedFrequency: number): number => {
  if (observedFrequency <= 0 || observedFrequency >= 1) {
    return 0;
  }
  const referenceBrier = observedFrequency * (1 - observedFrequency);
  return referenceBrier > 0 ? clamp(1 - brier / referenceBrier) : 0;
};

/** Spatial Brier Skill Score over the verification grid. */
export const scoreProbabilitySkill = (evaluation: GridEvaluation): ComponentScore => {
  const { forecast, observed, observedFrequency, cellCount } = evaluation;

  if (!isGradableEvaluation(evaluation)) {
    return notEvaluatedComponent('probabilitySkill', 'No forecast probability field and no reports on the grid.');
  }

  const brier = brierScore(forecast, observed, cellCount);

  if (observedFrequency === 0) {
    return scoredComponent(
      'probabilitySkill',
      0,
      `Brier ${roundTo(brier)} against zero observed frequency (overforecast).`,
      { brier: roundTo(brier), observedFrequency: 0, cells: cellCount }
    );
  }

  const bss = brierSkillScore(brier, observedFrequency);

  return scoredComponent(
    'probabilitySkill',
    bss,
    `Brier ${roundTo(brier)}, BSS ${roundTo(bss)} vs climatology ${roundTo(observedFrequency)}.`,
    {
      brier: roundTo(brier),
      bss: roundTo(bss),
      observedFrequency: roundTo(observedFrequency),
      cells: cellCount,
    }
  );
};
