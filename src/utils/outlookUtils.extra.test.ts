import {
  getOutlookConstraints,
  tornadoToCategorical,
  windToCategorical,
  hailToCategorical,
  totalSevereToCategorical,
  isSignificantThreat,
  getHighestCategoricalRisk,
  getCategoricalRiskDisplayName,
  getOutlookColor,
} from './outlookUtils';
import type { CIGLevel } from '../types/outlooks';

describe('outlookUtils extra', () => {
  test('getOutlookConstraints returns correct sets for days', () => {
    const d1 = getOutlookConstraints(1);
    expect(d1.outlookTypes).toEqual(expect.arrayContaining(['tornado', 'wind', 'hail', 'categorical']));
    const d3 = getOutlookConstraints(3);
    expect(d3.allowedCategorical).not.toContain('HIGH');
    const d8 = getOutlookConstraints(8);
    expect(d8.outlookTypes).toContain('day4-8');
    const d99 = getOutlookConstraints(99);
    expect(d99.outlookTypes).toEqual([]);
  });

  test('tornadoToCategorical maps probabilities properly', () => {
    expect(tornadoToCategorical({ probability: '2%', cig: 'CIG0' })).toBe('MRGL');
    expect(tornadoToCategorical({ probability: '2%', cig: 'CIG2' })).toBe('SLGT');
    expect(tornadoToCategorical({ probability: '5%', cig: 'CIG0' })).toBe('SLGT');
    expect(tornadoToCategorical({ probability: '5%', cig: 'CIG2' })).toBe('ENH');
    expect(tornadoToCategorical({ probability: '15%', cig: 'CIG2' })).toBe('MDT');
    expect(tornadoToCategorical({ probability: '30%', cig: 'CIG2' })).toBe('HIGH');
    expect(tornadoToCategorical({ probability: '60%', cig: 'CIG1' })).toBe('HIGH');
    expect(tornadoToCategorical({ probability: '1%', cig: 'CIG0' })).toBe('TSTM');
  });

  test('windToCategorical maps probabilities properly', () => {
    expect(windToCategorical({ probability: '5%', cig: 'CIG0' })).toBe('MRGL');
    expect(windToCategorical({ probability: '5%', cig: 'CIG2' })).toBe('SLGT');
    expect(windToCategorical({ probability: '15%', cig: 'CIG0' })).toBe('SLGT');
    expect(windToCategorical({ probability: '15%', cig: 'CIG2' })).toBe('ENH');
    expect(windToCategorical({ probability: '45%', cig: 'CIG2' })).toBe('MDT');
    expect(windToCategorical({ probability: '45%', cig: 'CIG3' })).toBe('HIGH');
  });

  test('hailToCategorical maps probabilities properly', () => {
    expect(hailToCategorical({ probability: '5%', cig: 'CIG0' })).toBe('MRGL');
    expect(hailToCategorical({ probability: '15%', cig: 'CIG0' })).toBe('SLGT');
    expect(hailToCategorical({ probability: '60%', cig: 'CIG0' })).toBe('ENH');
    expect(hailToCategorical({ probability: '45%', cig: 'CIG2' })).toBe('MDT');
  });

  test('totalSevereToCategorical maps probabilities for day3', () => {
    const expected: Record<string, [string, string, string]> = {
      '5%': ['MRGL', 'MRGL', 'SLGT'],
      '15%': ['SLGT', 'SLGT', 'ENH'],
      '30%': ['SLGT', 'ENH', 'ENH'],
      '45%': ['ENH', 'ENH', 'MDT'],
      '60%': ['ENH', 'MDT', 'MDT'],
    };

    for (const [probability, risks] of Object.entries(expected)) {
      for (const [index, cig] of (['CIG0', 'CIG1', 'CIG2'] as CIGLevel[]).entries()) {
        expect(totalSevereToCategorical({ probability, cig })).toBe(risks[index]);
      }
    }
  });

  test('isSignificantThreat detects # marker', () => {
    expect(isSignificantThreat({ probability: '#15%' })).toBe(true);
    expect(isSignificantThreat({ probability: '15%' })).toBe(false);
  });

  test('getHighestCategoricalRisk returns the worst of available', () => {
    const best = getHighestCategoricalRisk({ tornado: '60%', wind: '5%' });
    expect(best).toBe('ENH');
    const none = getHighestCategoricalRisk();
    expect(none).toBe('TSTM');
  });

  test('getCategoricalRiskDisplayName and getOutlookColor', () => {
    expect(getCategoricalRiskDisplayName('MRGL')).toContain('Marginal');
    expect(getCategoricalRiskDisplayName('HIGH')).toContain('High');

    // categorical mapping color
    expect(getOutlookColor({ outlookType: 'categorical', probability: 'TSTM' })).toBe('#C1E9C1');
    // tornado 15% mapping exists
    expect(getOutlookColor({ outlookType: 'tornado', probability: '15%' })).toBe('#FF8080');
    // unknown type returns default gray
    expect(getOutlookColor({ outlookType: 'unknown-type', probability: '5%' })).toBe('#808080');
  });
});
