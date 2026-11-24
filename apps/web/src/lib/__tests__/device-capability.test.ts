import { describe, expect, it } from 'vitest';
import { isLowPerformance, readCapabilitySignals } from '../device-capability';

describe('isLowPerformance', () => {
  it('treats an unknown device as capable', () => {
    expect(isLowPerformance({})).toBe(false);
  });
  it('flags data saver, slow connections, low memory and few cores', () => {
    expect(isLowPerformance({ saveData: true })).toBe(true);
    expect(isLowPerformance({ effectiveType: '3g' })).toBe(true);
    expect(isLowPerformance({ effectiveType: 'slow-2g' })).toBe(true);
    expect(isLowPerformance({ deviceMemory: 2 })).toBe(true);
    expect(isLowPerformance({ hardwareConcurrency: 2 })).toBe(true);
  });
  it('leaves capable devices alone', () => {
    expect(isLowPerformance({ saveData: false, effectiveType: '4g', deviceMemory: 8, hardwareConcurrency: 8 })).toBe(false);
    expect(isLowPerformance({ deviceMemory: 4, hardwareConcurrency: 4 })).toBe(false);
  });
});

describe('readCapabilitySignals', () => {
  it('reads the hints a browser exposes', () => {
    const nav = { hardwareConcurrency: 4, deviceMemory: 8, connection: { saveData: true, effectiveType: '4g' } } as unknown as Navigator;
    expect(readCapabilitySignals(nav)).toEqual({ saveData: true, effectiveType: '4g', deviceMemory: 8, hardwareConcurrency: 4 });
  });
  it('returns nothing when there is no navigator', () => {
    expect(readCapabilitySignals(undefined)).toEqual({});
  });
});
