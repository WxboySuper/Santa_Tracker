import { gradeForecast, runForecastGrade, validateGradeInputs } from './gradeForecast';
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
  [...(product?.components ?? []), ...(product?.diagnostics ?? [])]
    .find((component) => component.key === key);

const tornadoProduct = (grade: ReturnType<typeof gradeForecast>) =>
  grade.products.find((product) => product.product === 'tornado');

describe('gfc-ver-4 letter bands', () => {
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

describe('gfc-ver-4 input validation', () => {
  test('blocks a package with no severe hazard geometry', () => {
    const empty: OutlookData = { tornado: new Map(), wind: new Map(), hail: new Map(), categorical: new Map() };
    expect(validateGradeInputs({ outlooks: empty, reports: [] }).valid).toBe(false);
  });

  test('blocks categorical-only packages without severe hazard contours', () => {
    const categoricalOnly: OutlookData = {
      tornado: new Map(),
      wind: new Map(),
      hail: new Map(),
      categorical: new Map([['SLGT', [circleContour(CENTER[0], CENTER[1], 120)]]]),
    };
    expect(validateGradeInputs({ outlooks: categoricalOnly, reports: [] }).valid).toBe(false);
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

describe('gfc-ver-4 data quality gate', () => {
  test('quiet day is Good with a No reports label and is not evaluated', () => {
    const outlooks = tornadoOutlook('10%', circleContour(CENTER[0], CENTER[1], 120));
    const grade = gradeForecast({ outlooks, reports: [], generatedAt: '2026-01-01T00:00:00.000Z' });

    expect(grade.dataQuality).toBe('Good');
    expect(grade.dataQualityReason).toBe('No reports');
    expect(grade.hasReports).toBe(false);
    expect(grade.grade).toBeNull();
    expect(grade.products.find((product) => product.product === 'tornado')?.grade).toBeNull();
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

describe('gfc-ver-4 event yield intent', () => {
  test('broad 2% coverage that captures events passes without approaching perfect', () => {
    const outlooks = tornadoOutlook('2%', circleContour(CENTER[0], CENTER[1], 160));
    const reports = scatterReports('tornado', CENTER[0], CENTER[1], 3, 0.1);
    const grade = gradeForecast({ outlooks, reports });
    const product = tornadoProduct(grade);

    expect(product?.grade as number).toBeGreaterThanOrEqual(80);
    expect(product?.grade as number).toBeLessThan(90);
    expect(product?.components.find((component) => component.key === 'tierPlacement')?.score)
      .toBeCloseTo(0.65, 5);
  });

  test('huge 30% core with a single report fails yield', () => {
    const outlooks = tornadoOutlook('30%', circleContour(CENTER[0], CENTER[1], 160));
    const reports = [makeReport('tornado', CENTER[0], CENTER[1])];
    const grade = gradeForecast({ outlooks, reports });
    const yieldComponent = componentOf(tornadoProduct(grade), 'eventYield');

    expect(yieldComponent?.applicable).toBe(true);
    expect(yieldComponent?.score as number).toBeLessThan(0.3);
    expect(tornadoProduct(grade)?.grade as number).toBeLessThan(60);
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

describe('gfc-ver-4 diagnostics and skill', () => {
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

describe('gfc-ver-4 severity', () => {
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

describe('gfc-ver-4 product presence and per-hazard gating', () => {
  test('report-only product returns inapplicable without scoring components', () => {
    // Tornado has a 10% contour; hail does not. Hail has 4 reports anyway.
    const outlooks = tornadoOutlook('10%', circleContour(CENTER[0], CENTER[1], 120));
    const reports = scatterReports('hail', CENTER[0], CENTER[1], 4, 0.3);
    const grade = gradeForecast({ outlooks, reports });

    const hail = grade.products.find((product) => product.product === 'hail');
    expect(hail?.applicable).toBe(false);
    expect(hail?.grade).toBeNull();
    expect(hail?.reportCount).toBe(4);
    // No component for a report-only product should report a numeric score.
    hail?.components.forEach((component) => {
      expect(component.score).toBeNull();
    });
  });

  test('unrelated-hazard reports do not mask a sparse forecast product', () => {
    // Tornado has geometry, but zero tornado reports. Hail has 8 unrelated reports.
    // Data quality should reflect tornado being unobserved, not "Good" because of
    // the 8 unrelated hail reports.
    const outlooks = tornadoOutlook('10%', circleContour(CENTER[0], CENTER[1], 120));
    const reports = scatterReports('hail', CENTER[0], CENTER[1], 8, 0.3);
    const grade = gradeForecast({ outlooks, reports });

    expect(grade.dataQuality).toBe('Good');
    expect(grade.dataQualityReason).toBe('No reports');
    expect(grade.hasReports).toBe(false);
    // Tornado was the only product with geometry, but no tornado event was
    // observed, so there is no single-run outcome grade to calculate.
    expect(grade.grade).toBeNull();
  });

  test('only tornado-relevant reports gate the Limited threshold', () => {
    // 1 tornado report + 20 unrelated wind reports should still be Limited
    // because the tornado product is the one with geometry and is sparse.
    const outlooks = tornadoOutlook('10%', circleContour(CENTER[0], CENTER[1], 120));
    const tornadoReports = [makeReport('tornado', CENTER[0], CENTER[1])];
    const windReports = scatterReports('wind', CENTER[0], CENTER[1], 20, 0.3);
    const grade = gradeForecast({ outlooks, reports: [...tornadoReports, ...windReports] });

    expect(grade.dataQuality).toBe('Limited');
    expect(grade.grade).toBeNull();
  });
});

describe('gfc-ver-4 staged runForecastGrade', () => {
  test('reuses staged product grades and matches the synchronous gradeForecast result', async () => {
    const outlooks = tornadoOutlook('15%', circleContour(CENTER[0], CENTER[1], 90));
    const reports = scatterReports('tornado', CENTER[0], CENTER[1], 12, 0.4);

    const sync = gradeForecast({ outlooks, reports, generatedAt: '2026-01-01T00:00:00.000Z' });
    const staged = await runForecastGrade(
      { outlooks, reports, generatedAt: '2026-01-01T00:00:00.000Z' },
      () => undefined
    );

    expect(staged.grade).toBe(sync.grade);
    expect(staged.letter).toBe(sync.letter);
    expect(staged.dataQuality).toBe(sync.dataQuality);
    expect(staged.dataQualityReason).toBe(sync.dataQualityReason);
    expect(staged.hasReports).toBe(sync.hasReports);
    expect(staged.products.length).toBe(sync.products.length);
  });

  test('reports staged progress and yields between products', async () => {
    const outlooks = tornadoOutlook('10%', circleContour(CENTER[0], CENTER[1], 120));
    const reports: ReturnType<typeof makeReport>[] = [];
    const fractions: number[] = [];

    await runForecastGrade({ outlooks, reports }, (progress) => {
      fractions.push(progress.fraction);
    });

    // Fractions must be non-decreasing and end at 1.
    fractions.forEach((fraction, index) => {
      if (index > 0) {
        expect(fraction).toBeGreaterThanOrEqual(fractions[index - 1]);
      }
    });
    expect(fractions[fractions.length - 1]).toBe(1);
  });
});
