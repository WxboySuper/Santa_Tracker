import { isCustomCategoryList } from './customProducts';
import { listCustomStylePresets } from './customStylePresets';

describe('custom style presets', () => {
  it('exposes the reviewed rainfall and Tropical AOI presets', () => {
    expect(listCustomStylePresets().map(({ id }) => id)).toEqual(['rainfall', 'tropical-aoi']);
    expect(listCustomStylePresets().every(({ categories }) => isCustomCategoryList(categories))).toBe(true);
  });

  it('models Rainfall as the four WPC Excessive Rainfall Outlook risk categories', () => {
    const rainfall = listCustomStylePresets().find(({ id }) => id === 'rainfall');

    expect(rainfall?.description).toMatch(/WPC-style Excessive Rainfall Outlook/i);
    expect(rainfall?.categories.map(({ label }) => label)).toEqual([
      'Marginal Risk (≥5%)',
      'Slight Risk (≥15%)',
      'Moderate Risk (≥40%)',
      'High Risk (≥70%)',
    ]);
    expect(rainfall?.categories.map(({ style }) => style.fillColor)).toEqual([
      '#66A366',
      '#FFE066',
      '#E06666',
      '#EE99EE',
    ]);
  });

  it('returns detached categories so a layer or product edit cannot mutate the registry', () => {
    const first = listCustomStylePresets().find(({ id }) => id === 'rainfall');
    const second = listCustomStylePresets().find(({ id }) => id === 'rainfall');

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
    expect(first?.categories).not.toBe(second?.categories);

    first!.categories[0].label = 'Changed locally';
    first!.categories[0].style.fillColor = '#000000';

    expect(listCustomStylePresets().find(({ id }) => id === 'rainfall')?.categories[0]).toMatchObject({
      label: 'Marginal Risk (≥5%)',
      style: { fillColor: '#66A366' },
    });
    expect(second?.categories[0]).toMatchObject({
      label: 'Marginal Risk (≥5%)',
      style: { fillColor: '#66A366' },
    });
  });

});
