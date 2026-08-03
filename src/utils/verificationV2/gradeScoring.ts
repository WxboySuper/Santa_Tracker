import {
  COMPONENT_LABELS,
  COMPONENT_WEIGHTS,
  type ComponentKey,
  type ComponentScore,
  type LetterGrade,
} from './gradeContract';

/** Clamps a finite value into the inclusive [min, max] range; non-finite input becomes min. */
export const clamp = (value: number, min = 0, max = 1): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

/** Rounds a 0–100 grade to a single decimal place. */
export const roundGrade = (grade: number): number => Math.round(grade * 10) / 10;

/** Maps a 0–100 grade to a letter. A≥90 B≥80 C≥70 D≥60 F<60. */
export const scoreToLetter = (grade: number | null): LetterGrade | null => {
  if (grade === null || !Number.isFinite(grade)) {
    return null;
  }
  if (grade >= 90) return 'A';
  if (grade >= 80) return 'B';
  if (grade >= 70) return 'C';
  if (grade >= 60) return 'D';
  return 'F';
};

type ScorableComponent = Extract<ComponentScore, { applicable: true }>;

const isScorableComponent = (component: ComponentScore): component is ScorableComponent => {
  if (!component.applicable) {
    return false;
  }
  return Number.isFinite(component.score) && Number.isFinite(component.weight);
};

/** Combines component scores into a 0–100 product grade. */
export const composeComponents = (components: ComponentScore[]): number | null => {
  let weightSum = 0;
  let weighted = 0;

  for (const component of components) {
    if (!isScorableComponent(component)) {
      continue;
    }
    weightSum += component.weight;
    weighted += component.weight * component.score;
  }

  if (weightSum === 0) {
    return null;
  }

  return roundGrade((weighted / weightSum) * 100);
};

export const notEvaluatedComponent = (key: ComponentKey, detail: string): ComponentScore => ({
  key,
  label: COMPONENT_LABELS[key],
  weight: COMPONENT_WEIGHTS[key],
  score: null,
  applicable: false,
  detail,
});

export const scoredComponent = (
  key: ComponentKey,
  score: number,
  detail: string,
  metrics?: Record<string, number>
): ComponentScore => {
  if (!Number.isFinite(score)) {
    return notEvaluatedComponent(key, detail);
  }
  const normalized = clamp(score);
  return {
    key,
    label: COMPONENT_LABELS[key],
    weight: COMPONENT_WEIGHTS[key],
    score: normalized,
    applicable: true,
    detail,
    metrics,
  };
};
