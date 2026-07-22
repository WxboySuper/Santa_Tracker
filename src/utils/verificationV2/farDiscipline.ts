import { notEvaluatedComponent, scoredComponent, type ComponentScore } from './gradeContract';
import { type GridEvaluation, roundTo } from './gridEvaluation';

/** Probability-weighted areal false-alarm rate from the grid. */
export const scoreFalseAlarmDiscipline = (evaluation: GridEvaluation): ComponentScore => {
  const { forecast, observed, cellCount } = evaluation;

  let weightedHit = 0;
  let weightedFalseAlarm = 0;
  for (let index = 0; index < cellCount; index += 1) {
    const f = forecast[index];
    if (f <= 0) {
      continue;
    }
    if (observed[index] === 1) {
      weightedHit += f;
    } else {
      weightedFalseAlarm += f;
    }
  }

  const weightedForecast = weightedHit + weightedFalseAlarm;
  if (weightedForecast === 0) {
    return notEvaluatedComponent('farDiscipline', 'No forecast probability paint to evaluate.');
  }

  const far = weightedFalseAlarm / weightedForecast;
  return scoredComponent(
    'farDiscipline',
    1 - far,
    `Probability-weighted FAR ${roundTo(far)} (${roundTo(weightedFalseAlarm)} of ${roundTo(
      weightedForecast
    )} weighted paint unverified).`,
    { far: roundTo(far), weightedHit: roundTo(weightedHit), weightedFalseAlarm: roundTo(weightedFalseAlarm) }
  );
};
