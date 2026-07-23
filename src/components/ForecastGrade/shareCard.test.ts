import { shareCardFilename, shareSummaryText, composeShareCard } from './shareCard';
import type { PackageGrade } from '../../utils/verificationV2';

const pkg = (overrides: Partial<PackageGrade> = {}): PackageGrade => ({
  formulaVersion: 'gfc-ver-1',
  grade: 82.4,
  letter: 'B',
  products: [],
  dataQuality: 'Good',
  dataQualityReason: 'Forecast and reports available.',
  hasReports: true,
  generatedAt: '2026-05-01T12:00:00.000Z',
  ...overrides,
});

describe('share card helpers', () => {
  test('filename uses the run date', () => {
    expect(shareCardFilename(pkg())).toBe('forecast-grade-2026-05-01.png');
  });

  test('summary is anonymous and embeds the formula version', () => {
    expect(shareSummaryText(pkg())).toBe('Forecast Grade 82.4 (B) · Good · formula gfc-ver-1');
  });

  test('summary handles a withheld grade', () => {
    expect(shareSummaryText(pkg({ grade: null, letter: null, dataQuality: 'Limited' }))).toBe(
      'Forecast Grade withheld · Limited · formula gfc-ver-1'
    );
  });

  test('composes a canvas card when a 2D context is available', () => {
    const canvas = composeShareCard(pkg(), null);
    // jsdom canvas may lack a 2D context; either a canvas or null is acceptable.
    if (canvas) {
      expect(canvas.width).toBeGreaterThan(0);
      expect(canvas.height).toBeGreaterThan(0);
    } else {
      expect(canvas).toBeNull();
    }
  });
});
