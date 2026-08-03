import { validateCycleCompletion } from './completionValidation';
import type { ForecastCycle, DayType, OutlookType } from '../types/outlooks';

type DayFixtureMode = 'full' | 'lowProb' | 'empty' | 'withDiscussion' | 'emptyDiscussion';

const expectedOutlookTypesForDay = (day: DayType): OutlookType[] => {
  if (day === 1 || day === 2) return ['tornado', 'wind', 'hail', 'categorical'];
  if (day === 3) return ['totalSevere', 'categorical'];
  return ['day4-8'];
};

const buildOutlookData = (day: DayType): Record<string, Map<string, unknown[]>> => {
  if (day === 1 || day === 2) {
    return {
      tornado: new Map([['2%', [{ id: 't1' }]]]),
      wind: new Map([['5%', [{ id: 'w1' }]]]),
      hail: new Map([['5%', [{ id: 'h1' }]]]),
      categorical: new Map([['SLGT', [{ id: 'c1' }]]]),
    };
  }

  if (day === 3) {
    return {
      totalSevere: new Map([['15%', [{ id: 'ts1' }]]]),
      categorical: new Map([['SLGT', [{ id: 'c1' }]]]),
    };
  }

  return {
    'day4-8': new Map([['15%', [{ id: 'd1' }]]]),
  };
};

const createDayFixture = (day: DayType, mode: DayFixtureMode) => {
  const baseMetadata = {
    issueDate: new Date().toISOString(),
    validDate: new Date().toISOString(),
    issuanceTime: '0600',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    lowProbabilityOutlooks: [] as OutlookType[],
  };

  if (mode === 'empty') {
    return {
      day,
      data: {} as ForecastCycle['days'][DayType]['data'],
      metadata: baseMetadata,
      discussion: undefined,
    };
  }

  if (mode === 'lowProb') {
    return {
      day,
      data: {} as ForecastCycle['days'][DayType]['data'],
      metadata: {
        ...baseMetadata,
        lowProbabilityOutlooks: expectedOutlookTypesForDay(day),
      },
      discussion: undefined,
    };
  }

  const dayFixture = {
    day,
    data: buildOutlookData(day) as ForecastCycle['days'][DayType]['data'],
    metadata: baseMetadata,
    discussion: undefined as ForecastCycle['days'][DayType]['discussion'],
  };

  if (mode === 'withDiscussion') {
    dayFixture.discussion = {
      mode: 'diy',
      validStart: new Date().toISOString(),
      validEnd: new Date().toISOString(),
      forecasterName: 'Test',
      diyContent: 'This is a test discussion.',
      lastModified: new Date().toISOString(),
    };
  }

  if (mode === 'emptyDiscussion') {
    dayFixture.discussion = {
      mode: 'diy',
      validStart: new Date().toISOString(),
      validEnd: new Date().toISOString(),
      forecasterName: 'Test',
      diyContent: '',
      lastModified: new Date().toISOString(),
    };
  }

  return dayFixture;
};

const createForecastCycle = (
  days: ForecastCycle['days'],
  currentDay: DayType = 1,
): ForecastCycle => ({
  days,
  currentDay,
  cycleDate: '2026-06-13',
});

describe('validateCycleCompletion', () => {
  it('returns incomplete for empty cycle', () => {
    const result = validateCycleCompletion(createForecastCycle({}));
    expect(result.isComplete).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('returns complete with a warning when all day1 types are low probability but discussion is missing', () => {
    const result = validateCycleCompletion(
      createForecastCycle({ 1: createDayFixture(1, 'lowProb') }),
      ['day1'],
    );
    expect(result.isComplete).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('missing-discussion');
  });

  it('reports missing polygon for day1 with no data', () => {
    const result = validateCycleCompletion(
      createForecastCycle({ 1: createDayFixture(1, 'empty') }),
      ['day1'],
    );
    expect(result.isComplete).toBe(false);
    expect(result.issues.some((i) => i.type === 'missing-polygon')).toBe(true);
    expect(result.missingGroupings).toContain('day1');
  });

  it('reports missing discussion when polygons exist but discussion is empty', () => {
    const result = validateCycleCompletion(
      createForecastCycle({ 1: createDayFixture(1, 'emptyDiscussion') }),
      ['day1'],
    );
    expect(result.isComplete).toBe(true);
    expect(result.issues.some((i) => i.type === 'missing-discussion')).toBe(true);
  });

  it('is complete when day1 has all polygons and discussion', () => {
    const result = validateCycleCompletion(
      createForecastCycle({ 1: createDayFixture(1, 'withDiscussion') }),
      ['day1'],
    );
    expect(result.isComplete).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('validates day3 with totalSevere and categorical', () => {
    const result = validateCycleCompletion(
      createForecastCycle({ 3: createDayFixture(3, 'full') }, 3),
      ['day3'],
    );
    expect(result.isComplete).toBe(true);
  });

  it('validates day4 with day4-8 outlook', () => {
    const result = validateCycleCompletion(
      createForecastCycle({ 4: createDayFixture(4, 'full') }, 4),
      ['day4-8'],
    );
    expect(result.issues.some((i) => i.day === 'day4-8' && i.outlookType === 'day4-8' && i.type === 'missing-polygon')).toBe(true);
    expect(result.missingGroupings).toContain('day4-8');
  });

  it('uses one Days 4–8 discussion for every day in that grouping', () => {
    const days = [4, 5, 6, 7, 8].reduce<ForecastCycle['days']>((result, day) => {
      result[day as DayType] = createDayFixture(day as DayType, day === 4 ? 'withDiscussion' : 'full');
      return result;
    }, {});

    const result = validateCycleCompletion(createForecastCycle(days, 4), ['day4-8']);
    expect(result.issues.filter((issue) => issue.type === 'missing-discussion')).toHaveLength(0);
  });

  it('reports no-tstm-forecast warning when categorical has only TSTM but is not low probability', () => {
    const day = createDayFixture(1, 'empty');
    day.data.tornado = new Map([['2%', [{ id: 't1' }]]]);
    day.data.wind = new Map([['5%', [{ id: 'w1' }]]]);
    day.data.hail = new Map([['5%', [{ id: 'h1' }]]]);
    day.data.categorical = new Map([['TSTM', [{ id: 'c1' }]]]);
    day.metadata.lowProbabilityOutlooks = [];

    const result = validateCycleCompletion(createForecastCycle({ 1: day }), ['day1']);
    expect(result.issues.some((i) => i.type === 'no-tstm-forecast')).toBe(true);
    expect(result.issues.some((i) => i.outlookType === 'categorical' && i.type === 'missing-polygon')).toBe(false);
  });

  it.each([
    ['critical', 'empty', (issues: ReturnType<typeof validateCycleCompletion>['issues']) => {
      expect(issues.filter((issue) => issue.severity === 'critical').length).toBeGreaterThan(0);
    }],
    ['warning', 'emptyDiscussion', (issues: ReturnType<typeof validateCycleCompletion>['issues']) => {
      expect(issues.filter((issue) => issue.severity === 'warning').length).toBeGreaterThan(0);
    }],
  ] as const)('returns %s issues with expected severity', (_label, mode, assertSeverity) => {
    const result = validateCycleCompletion(
      createForecastCycle({ 1: createDayFixture(1, mode) }),
      ['day1'],
    );
    assertSeverity(result.issues);
  });
});
