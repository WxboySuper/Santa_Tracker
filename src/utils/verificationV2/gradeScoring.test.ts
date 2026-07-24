import {
  clamp,
  composeComponents,
  notEvaluatedComponent,
  roundGrade,
  scoreToLetter,
  scoredComponent,
} from './gradeScoring';

describe('gradeScoring', () => {
  describe('clamp', () => {
    it('clamps finite values into range', () => {
      expect(clamp(1.5)).toBe(1);
      expect(clamp(-0.2)).toBe(0);
      expect(clamp(0.4)).toBe(0.4);
    });

    it('returns min for non-finite input', () => {
      expect(clamp(Number.NaN)).toBe(0);
      expect(clamp(Number.POSITIVE_INFINITY)).toBe(0);
    });
  });

  describe('scoreToLetter', () => {
    it('maps grade bands to letters', () => {
      expect(scoreToLetter(95)).toBe('A');
      expect(scoreToLetter(85)).toBe('B');
      expect(scoreToLetter(75)).toBe('C');
      expect(scoreToLetter(65)).toBe('D');
      expect(scoreToLetter(40)).toBe('F');
    });

    it('returns null for null and non-finite grades', () => {
      expect(scoreToLetter(null)).toBeNull();
      expect(scoreToLetter(Number.NaN)).toBeNull();
      expect(scoreToLetter(Number.POSITIVE_INFINITY)).toBeNull();
      expect(scoreToLetter(Number.NEGATIVE_INFINITY)).toBeNull();
    });
  });

  describe('composeComponents', () => {
    it('renormalizes applicable component weights', () => {
      const grade = composeComponents([
        scoredComponent('probabilitySkill', 0.8, 'ok'),
        notEvaluatedComponent('spatialContingency', 'n/a'),
        scoredComponent('farDiscipline', 0.6, 'ok'),
      ]);
      expect(grade).toBe(roundGrade(((25 * 0.8 + 15 * 0.6) / 40) * 100));
    });

    it('returns null when no scorable components remain', () => {
      expect(composeComponents([notEvaluatedComponent('eventYield', 'n/a')])).toBeNull();
    });

    it('ignores non-finite scores from scoredComponent', () => {
      const grade = composeComponents([scoredComponent('severity', Number.NaN, 'bad')]);
      expect(grade).toBeNull();
    });
  });

  describe('scoredComponent', () => {
    it('marks non-finite scores as not evaluated', () => {
      const component = scoredComponent('severity', Number.POSITIVE_INFINITY, 'bad');
      expect(component).toEqual(
        expect.objectContaining({ applicable: false, score: null })
      );
    });
  });
});
