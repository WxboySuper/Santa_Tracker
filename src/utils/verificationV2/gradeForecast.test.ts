import { gradeForecast, validateGradeInputs } from './gradeForecast';
import { scoreToLetter, type ComponentKey, type ProductGrade } from './gradeContract';
import { FORECAST_GRADE_FORMULA_VERSION } from './formulaVersion';
import {
  circleContour,
  makeReport,
  scatterReports,
  tornadoOutlook,
} from './testFixtures';
import type { OutlookData } from '../../types/outlooks';

const CENTER: [number, number] = [-97, 37];

const componentOf = (product: ProductGrade | undefined, key: ComponentKey) =>
  product?.components.find((component) => component.key === key);

const tornadoProduct = (grade: ReturnType<typeof gradeForecast>) =>
  grade.products.find((product) => product.product === 'tornado');

describe('gfc-ver-1 letter bands', () => {
  test.each([
    [95, 'A'],
    [90, 'A'],
    [82.4, 'B'],
    [70, 'C'],
    [60, 'D'],
    [59.9, 'F'],
    [null, null],
  ] as const)('maps %s to %s', (grade, letter) => {
    expect(scoreToLetter(grade)).toBe(letter);
  });
});

describe('gfc-ver-1 input validation', () => {
  test('blocks a package with no geometry', () => {
    const empty: OutlookData = { tornado: new Map(), wind: new Map(), hail: new Map(), categorical: new Map() };
    expect(validateGradeInputs({ outlooks: empty, reports: [] }).valid).toBe(false);
  });

  test('blocks when the report fetch failed', () => {
    const outlooks = tornadoOutlook('10%', circleContour(CENTER[0], CENTER[1], 120));
    expect(validateGradeInputs({ outlooks, reports: [], reportsError: true }).valid).toBe(false);
  });

  test('accepts a package with geometry and report array', () => {
    const outlooks = tornadoOutlook('10%', circleContour(CENTER[0], CENTER[1], 120));
    expect(validateGradeInputs({ outlooks, reports: [] }).valid).toBe(true);
  });
});

describe('gfc-ver-1 data quality gate', () => {
  test('quiet day is Good with a No reports label and still produces a grade', () => {
    const outlooks = tornadoOutlook('10%', circleContour(CENTER[0], CENTER[1], 120));
    const grade = gradeForecast({ outlooks, reports: [], generatedAt: '2026-01-01T00:00:00.000Z' });

    expect(grade.dataQuality).toBe('Good');
    expect(grade.dataQualityReason).toBe('No reports');
    expect(grade.hasReports).toBe(false);
    expect(grade.grade).not.toBeNull();
    // Overforecast quiet day should score poorly.
    expect(grade.grade as number).toBeLessThan(60);
    expect(grade.formulaVersion).toBe(FORECAST_GRADE_FORMULA_VERSION);
  });

  test('sparse non-quiet run is Limited and withholds the package grade', () => {
    const outlooks = tornadoOutlook('10%', circleContour(CENTER[0], CENTER[1], 120));
    const reports = [makeReport('tornado', CENTER[0], CENTER[1])];
    const grade = gradeForecast({ outlooks, reports });

    expect(grade.dataQuality).toBe('Limited');
    expect(grade.grade).toBeNull();
    // Components are still computed and shown even when the grade is withheld.
    const skill = componentOf(tornadoProduct(grade), 'probabilitySkill');
    expect(skill?.applicable).toBe(true);
  });

  test('blocks when reports fail to load', () => {
    const outlooks = tornadoOutlook('10%', circleContour(CENTER[0], CENTER[1], 120));
    const grade = gradeForecast({ outlooks, reports: [], reportsError: true });
    expect(grade.dataQuality).toBe('Blocked');
    expect(grade.grade).toBeNull();
  });
});

describe('gfc-ver-1 event yield intent', () => {
  test('huge 30% core with a single report fails yield', () => {
    const outlooks = tornadoOutlook('30%', circleContour(CENTER[0], CENTER[1], 160));
    const reports = [makeReport('tornado', CENTER[0], CENTER[1])];
    const grade = gradeForecast({ outlooks, reports });
    const yieldComponent = componentOf(tornadoProduct(grade), 'eventYield');

    expect(yieldComponent?.applicable).toBe(true);
    expect(yieldComponent?.score as number).toBeLessThan(0.3);
  });

  test('tiny 45% core with one report is softened below full yield', () => {
    const outlooks = tornadoOutlook('45%', circleContour(CENTER[0], CENTER[1], 20));
    const reports = [makeReport('tornado', CENTER[0], CENTER[1])];
    const grade = gradeForecast({ outlooks, reports });
    const yieldComponent = componentOf(tornadoProduct(grade), 'eventYield');

    expect(yieldComponent?.score as number).toBeGreaterThan(0);
    expect(yieldComponent?.score as number).toBeLessThan(1);
  });

  test('tiny 45% core with many reports reaches full yield', () => {
    const outlooks = tornadoOutlook('45%', circleContour(CENTER[0], CENTER[1], 20));
    const reports = scatterReports('tornado', CENTER[0], CENTER[1], 8, 0.05);
    const grade = gradeForecast({ outlooks, reports });
    const yieldComponent = componentOf(tornadoProduct(grade), 'eventYield');

    expect(yieldComponent?.score as number).toBeGreaterThan(0.9);
  });
});

describe('gfc-ver-1 false-alarm discipline and skill', () => {
  test('dense congestion scenario grades well across components', () => {
    const outlooks = tornadoOutlook('15%', circleContour(CENTER[0], CENTER[1], 90));
    const reports = scatterReports('tornado', CENTER[0], CENTER[1], 12, 0.4);
    const grade = gradeForecast({ outlooks, reports });
    const product = tornadoProduct(grade);

    expect(grade.dataQuality).toBe('Good');
    expect(product?.grade).not.toBeNull();
    const far = componentOf(product, 'farDiscipline');
    const skill = componentOf(product, 'probabilitySkill');
    expect(far?.applicable).toBe(true);
    expect(skill?.applicable).toBe(true);
  });

  test('quiet overforecast drives false-alarm discipline toward zero', () => {
    const outlooks = tornadoOutlook('30%', circleContour(CENTER[0], CENTER[1], 120));
    const grade = gradeForecast({ outlooks, reports: [] });
    const far = componentOf(tornadoProduct(grade), 'farDiscipline');
    expect(far?.applicable).toBe(true);
    expect(far?.score as number).toBeLessThan(0.05);
  });
});

describe('gfc-ver-1 severity', () => {
  test('significant contour with no significant report applies the soft penalty', () => {
    const outlooks = tornadoOutlook('15%#', circleContour(CENTER[0], CENTER[1], 90));
    const reports = scatterReports('tornado', CENTER[0], CENTER[1], 6, 0.3);
    const grade = gradeForecast({ outlooks, reports });
    const severity = componentOf(tornadoProduct(grade), 'severity');
    expect(severity?.applicable).toBe(true);
    expect(severity?.score).toBeCloseTo(0.7, 5);
  });

  test('significant contour with a significant report scores a hit', () => {
    const outlooks = tornadoOutlook('15%#', circleContour(CENTER[0], CENTER[1], 90));
    const reports = [makeReport('tornado', CENTER[0], CENTER[1], 'EF3'), ...scatterReports('tornado', CENTER[0], CENTER[1], 4, 0.3)];
    const grade = gradeForecast({ outlooks, reports });
    const severity = componentOf(tornadoProduct(grade), 'severity');
    expect(severity?.score).toBeCloseTo(1, 5);
  });

  test('severity is not evaluated when neither sig contour nor sig report exists', () => {
    const outlooks = tornadoOutlook('10%', circleContour(CENTER[0], CENTER[1], 90));
    const reports = scatterReports('tornado', CENTER[0], CENTER[1], 5, 0.3);
    const grade = gradeForecast({ outlooks, reports });
    const severity = componentOf(tornadoProduct(grade), 'severity');
    expect(severity?.applicable).toBe(false);
  });
});
