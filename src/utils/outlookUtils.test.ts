import { tornadoToCategorical, isSignificantThreat, getOutlookColor, getCategoricalRiskDisplayName, getHighestCategoricalRisk } from './outlookUtils';

describe('outlookUtils', () => {
  test('tornadoToCategorical simple mapping', () => {
    expect(tornadoToCategorical({ probability: '2%', cig: 'CIG0' })).toBe('MRGL');
  });

  test('isSignificantThreat detects #', () => {
    expect(isSignificantThreat({ probability: '5%#' })).toBe(true);
    expect(isSignificantThreat({ probability: '5%' })).toBe(false);
  });

  test('getOutlookColor returns mapped color', () => {
    expect(getOutlookColor({ outlookType: 'tornado', probability: '2%' })).toBe('#79BA7A');
  });

  test('getCategoricalRiskDisplayName', () => {
    expect(getCategoricalRiskDisplayName('MDT')).toContain('Moderate');
  });

  test('getHighestCategoricalRisk picks highest', () => {
    const highest = getHighestCategoricalRisk({ tornado: '2%', wind: '5%', hail: '5%' });
    expect(highest).toBe('MRGL');
  });
});
