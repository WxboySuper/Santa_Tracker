import { shareCardFilename, shareSummaryText, composeShareCard } from './shareCard';
import type { PackageGrade } from '../../utils/verificationV2';

const pkg = (overrides: Partial<PackageGrade> = {}): PackageGrade => ({
  formulaVersion: 'gfc-ver-3',
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
    expect(shareSummaryText(pkg())).toBe('Forecast Grade 82.4 (B) · Good · formula gfc-ver-3');
  });

  test('summary handles a withheld grade', () => {
    expect(shareSummaryText(pkg({ grade: null, letter: null, dataQuality: 'Limited' }))).toBe(
      'Forecast Grade withheld · Limited · formula gfc-ver-3'
    );
  });

  test('composes a canvas card with expected dimensions and drawing calls', () => {
    const fillTextCalls: Array<{ text: string; x: number; y: number }> = [];
    const fillRectCalls: Array<{ x: number; y: number; w: number; h: number }> = [];
    let drawImageCallCount = 0;

    const mockCtx = {
      fillStyle: '',
      font: '',
      fillText: (text: string, x: number, y: number) => fillTextCalls.push({ text, x, y }),
      fillRect: (x: number, y: number, w: number, h: number) => fillRectCalls.push({ x, y, w, h }),
      drawImage: () => { drawImageCallCount++; },
      measureText: () => ({ width: 100 }),
    };

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => mockCtx,
          toDataURL: () => 'data:image/png;base64,',
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    });

    try {
      const canvas = composeShareCard(pkg(), null);
      expect(canvas).not.toBeNull();
      expect(canvas!.width).toBe(1200);
      expect(canvas!.height).toBe(630);

      expect(fillTextCalls.some((c) => c.text === 'Forecast Grade')).toBe(true);
      expect(fillTextCalls.some((c) => c.text === '82.4')).toBe(true);
      expect(fillTextCalls.some((c) => c.text === 'B')).toBe(true);
      expect(fillTextCalls.some((c) => c.text.includes('formula gfc-ver-3'))).toBe(true);
      expect(fillRectCalls.length).toBeGreaterThanOrEqual(1);
      expect(drawImageCallCount).toBe(0);
    } finally {
      jest.restoreAllMocks();
    }
  });

  test('composes a canvas card with map image when provided', () => {
    let drawImageCallCount = 0;

    const mockCtx = {
      fillStyle: '',
      font: '',
      fillText: () => {},
      fillRect: () => {},
      drawImage: () => { drawImageCallCount++; },
      measureText: () => ({ width: 100 }),
    };

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => mockCtx,
          toDataURL: () => 'data:image/png;base64,',
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    });

    try {
      const mockImage = { width: 800, height: 600 } as unknown as HTMLImageElement;
      const canvas = composeShareCard(pkg(), mockImage);
      expect(canvas).not.toBeNull();
      expect(drawImageCallCount).toBe(1);
    } finally {
      jest.restoreAllMocks();
    }
  });
});
