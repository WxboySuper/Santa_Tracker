import { cloneCustomValue } from './customLayerReducerUtils';

describe('cloneCustomValue', () => {
  test('preserves nested undefined and non-finite numbers without sharing objects', () => {
    const value = {
      optional: undefined,
      numbers: [Number.NaN, Infinity, -Infinity],
      nested: { label: 'layer' },
    };

    const clone = cloneCustomValue(value);

    expect(clone).toEqual(value);
    expect(clone).not.toBe(value);
    expect('optional' in clone).toBe(true);
    expect(Number.isNaN(clone.numbers[0])).toBe(true);
    expect(clone.nested).not.toBe(value.nested);
  });

  test('keeps an own __proto__ value as data', () => {
    const value = JSON.parse('{"__proto__":{"polluted":true}}') as { __proto__: { polluted: boolean } };
    const clone = cloneCustomValue(value);

    expect(Object.prototype.hasOwnProperty.call(clone, '__proto__')).toBe(true);
    expect(clone.__proto__).toEqual({ polluted: true });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
