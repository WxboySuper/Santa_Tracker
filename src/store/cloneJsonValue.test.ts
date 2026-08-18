import { cloneJsonValue } from './cloneJsonValue';

describe('cloneJsonValue', () => {
  test('preserves an own __proto__ key without changing the clone prototype', () => {
    const input = JSON.parse('{"__proto__":{"polluted":true},"ok":1}') as Record<string, unknown>;

    const cloned = cloneJsonValue(input) as Record<string, unknown>;

    expect(Object.getPrototypeOf(cloned)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(cloned, '__proto__')).toBe(true);
    expect(cloned.__proto__).toEqual({ polluted: true });
    expect(cloned.ok).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
