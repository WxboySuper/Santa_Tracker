import { matchesPrecisionEditTier, PAN_MODE_VERTEX_EDIT_HELP } from './precisionPolygonEditing';

describe('precisionPolygonEditing', () => {
  it('mentions vertex removal shortcut in pan-mode help', () => {
    expect(PAN_MODE_VERTEX_EDIT_HELP).toContain('Alt or Shift+click');
    expect(PAN_MODE_VERTEX_EDIT_HELP.length).toBeLessThan(120);
  });

  it('matches both outlook type and probability for editing', () => {
    const feature = { get: (key: string) => ({ outlookType: 'tornado', probability: '5%' }[key]) };

    expect(matchesPrecisionEditTier(feature, 'tornado', '5%')).toBe(true);
    expect(matchesPrecisionEditTier(feature, 'wind', '5%')).toBe(false);
    expect(matchesPrecisionEditTier(feature, 'tornado', '15%')).toBe(false);
  });
});
