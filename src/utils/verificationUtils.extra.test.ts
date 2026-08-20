import { polygon as turfPolygon } from '@turf/turf';
import {
  analyzeVerification,
  calculatePOD,
  formatVerificationSummary,
  formatOutlookVerificationSummary,
} from './verificationUtils';

describe('verificationUtils', () => {
  test('analyzeVerification counts hits and byRiskLevel correctly', () => {
    // Create a small square polygon that contains the report point
    const polygon = turfPolygon([[[-97.21, 33.49], [-97.19, 33.49], [-97.19, 33.51], [-97.21, 33.51], [-97.21, 33.49]]]);

    const outlooks = {
      categorical: new Map([['ENH', [polygon]]]),
      tornado: new Map([['ENH', [polygon]]]),
      wind: new Map(),
      hail: new Map()
    };

    const reports = [
      {
        id: 'r1',
        type: 'tornado',
        latitude: 33.5,
        longitude: -97.2,
        time: '1234Z',
        magnitude: 'EF1',
        location: 'TestTown',
        county: 'TestCo',
        state: 'TX',
        comments: ''
      }
    ];

    const res = analyzeVerification(reports, outlooks);

    expect(res.totalReports).toBe(1);
    expect(res.reportsByType.tornado).toBe(1);
    expect(res.tornado.hits).toBe(1);
    expect(res.tornado.misses).toBe(0);
    expect(res.tornado.byRiskLevel['ENH']).toBeDefined();
    expect(res.tornado.byRiskLevel['ENH'].hits).toBe(1);

    // POD should be 100% for this single hit
    expect(calculatePOD(res.tornado.hits, res.tornado.misses)).toBe(100);

    const summary = formatVerificationSummary(res, 'tornado');
    expect(summary).toContain('Total Reports: 1');
    expect(summary).toContain('ENH: 1 hits');
  });

  test('bbox prefilter does not turn an outside-but-in-bounds report into a hit', () => {
    const polygon = turfPolygon([[[-97.21, 33.49], [-97.19, 33.49], [-97.2, 33.5], [-97.21, 33.49]]]);
    const outlooks = {
      categorical: new Map([['ENH', [polygon]]]),
      tornado: new Map([['ENH', [polygon]]]),
      wind: new Map(),
      hail: new Map(),
    };
    const reports = [{
      id: 'r-outside', type: 'tornado' as const, latitude: 33.495, longitude: -97.19,
      time: '1234Z', magnitude: 'EF1', location: 'TestTown', county: 'TestCo', state: 'TX', comments: '',
    }];

    const result = analyzeVerification(reports, outlooks);

    expect(result.tornado.hits).toBe(0);
    expect(result.tornado.misses).toBe(1);
    expect(result.tornado.reportDetails[0]?.hit).toBe(false);
  });

  test('formatOutlookVerificationSummary sorts risk levels highest-first and formats text', () => {
    const verification = {
      hits: 3,
      misses: 1,
      hitRate: 75,
      byRiskLevel: {
        'TSTM': { hits: 1, misses: 0, hitRate: 25, total: 4 },
        'HIGH': { hits: 2, misses: 0, hitRate: 50, total: 4 }
      },
      reportDetails: []
    };

    const out = formatOutlookVerificationSummary('tornado', verification as {
      hits: number;
      misses: number;
      hitRate: number;
      byRiskLevel: Record<string, { hits: number; misses: number; hitRate: number; total: number }>;
      reportDetails: unknown[];
    });
    expect(out.startsWith('TORNADO Verification:')).toBe(true);
    // HIGH should appear before TSTM in the text
    const hi = out.indexOf('HIGH:');
    const ts = out.indexOf('TSTM:');
    expect(hi).toBeGreaterThan(-1);
    expect(ts).toBeGreaterThan(-1);
    expect(hi).toBeLessThan(ts);
  });
});
