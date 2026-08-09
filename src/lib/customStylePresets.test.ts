import { isCustomCategoryList } from './customProducts';
import { listCustomStylePresets } from './customStylePresets';

describe('custom style presets', () => {
  it('exposes the reviewed rainfall and Tropical AOI presets', () => {
    expect(listCustomStylePresets().map(({ id }) => id)).toEqual(['rainfall', 'tropical-aoi']);
    expect(listCustomStylePresets().every(({ categories }) => isCustomCategoryList(categories))).toBe(true);
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
      label: 'Trace–0.10 in',
      style: { fillColor: '#dbeafe' },
    });
    expect(second?.categories[0]).toMatchObject({
      label: 'Trace–0.10 in',
      style: { fillColor: '#dbeafe' },
    });
  });

});
