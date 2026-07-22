import { scoreEventYield, scoreSeverity } from './yieldSeverity';

describe('yieldSeverity', () => {
  it('exports callable scorers', () => {
    expect(typeof scoreEventYield).toBe('function');
    expect(typeof scoreSeverity).toBe('function');
  });
});
