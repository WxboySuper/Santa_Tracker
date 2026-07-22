import {
  GRADE_HISTORY_LIMIT,
  accountScope,
  clearGradeHistory,
  loadGradeCards,
  loadGradeSnapshot,
  recordGradeResult,
} from './gradeHistory';
import {
  availablePackageSources,
  buildGradeCard,
  resolveAccountTier,
  tierHasHistory,
  tierHasSnapshots,
  toArchiveDate,
} from './sources';
import { gradeForecast } from './gradeForecast';
import { circleContour, scatterReports, tornadoOutlook } from './testFixtures';
import type { GradeCard, GradeSnapshot } from '../../types/forecastGrade';

const scope = 'user:test';

const sampleCard = (overrides: Partial<GradeCard> = {}): GradeCard => ({
  id: `card-${Math.random().toString(36).slice(2)}`,
  createdAt: new Date().toISOString(),
  reportDate: '2026-05-01',
  formulaVersion: 'gfc-ver-1',
  grade: 82.4,
  letter: 'B',
  dataQuality: 'Good',
  productGrades: { tornado: 82.4 },
  sourceLabel: 'File + SPC',
  hasSnapshot: false,
  ...overrides,
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('account tiers and sources', () => {
  test('resolves tier from auth + entitlement', () => {
    expect(resolveAccountTier(false, false)).toBe('signed-out');
    expect(resolveAccountTier(true, false)).toBe('free');
    expect(resolveAccountTier(true, true)).toBe('premium');
  });

  test('only premium gets the cloud package source', () => {
    expect(availablePackageSources('signed-out')).toEqual(['file']);
    expect(availablePackageSources('free')).toEqual(['file']);
    expect(availablePackageSources('premium')).toEqual(['file', 'cloud']);
  });

  test('converts ISO date input to SPC archive YYMMDD', () => {
    expect(toArchiveDate('2024-05-06')).toBe('240506');
    expect(toArchiveDate('240506')).toBe('240506');
    expect(toArchiveDate('2024-99-99')).toBeNull();
    expect(toArchiveDate('2024-5-6')).toBeNull();
  });

  test('history and snapshot capability by tier', () => {
    expect(tierHasHistory('signed-out')).toBe(false);
    expect(tierHasHistory('free')).toBe(true);
    expect(tierHasSnapshots('free')).toBe(false);
    expect(tierHasSnapshots('premium')).toBe(true);
  });
});

describe('account scope', () => {
  test('signed-out sessions are never persisted', () => {
    expect(accountScope('signed-out')).toBeNull();
    expect(accountScope('free', 'abc')).toBe('user:abc');
    expect(accountScope('free')).toBeNull();
  });
});

describe('grade history persistence', () => {
  test('prepends new runs and never rewrites earlier history', () => {
    recordGradeResult({ scope, card: sampleCard({ id: 'a', grade: 70 }) });
    recordGradeResult({ scope, card: sampleCard({ id: 'b', grade: 90 }) });

    const cards = loadGradeCards(scope);
    expect(cards.map((card) => card.id)).toEqual(['b', 'a']);
  });

  test('trims to the latest limit', () => {
    for (let index = 0; index < GRADE_HISTORY_LIMIT + 5; index += 1) {
      recordGradeResult({ scope, card: sampleCard({ id: `card-${index}` }) });
    }
    expect(loadGradeCards(scope)).toHaveLength(GRADE_HISTORY_LIMIT);
  });

  test('stores and restores premium snapshots and evicts them past the limit', () => {
    const card = sampleCard({ id: 'snap', hasSnapshot: true });
    const snapshot = { card, package: { grade: 82.4 }, forecast: {}, reportDate: '2026-05-01' } as unknown as GradeSnapshot;
    recordGradeResult({ scope, card, snapshot });
    expect(loadGradeSnapshot(scope, 'snap')).not.toBeNull();

    for (let index = 0; index < GRADE_HISTORY_LIMIT; index += 1) {
      recordGradeResult({ scope, card: sampleCard({ id: `filler-${index}` }) });
    }
    expect(loadGradeSnapshot(scope, 'snap')).toBeNull();
  });

  test('clears history', () => {
    recordGradeResult({ scope, card: sampleCard({ id: 'x' }) });
    clearGradeHistory(scope);
    expect(loadGradeCards(scope)).toHaveLength(0);
  });
});

describe('buildGradeCard', () => {
  test('distills a package grade into a trend card', () => {
    const outlooks = tornadoOutlook('15%', circleContour(-97, 37, 90));
    const pkg = gradeForecast({ outlooks, reports: scatterReports('tornado', -97, 37, 10, 0.4) });
    const card = buildGradeCard(pkg, { reportDate: '2026-05-01', sourceLabel: 'File + SPC', hasSnapshot: false });

    expect(card.formulaVersion).toBe('gfc-ver-1');
    expect(card.productGrades.tornado).toBe(pkg.products.find((p) => p.product === 'tornado')?.grade ?? null);
    expect(card.reportDate).toBe('2026-05-01');
  });
});
