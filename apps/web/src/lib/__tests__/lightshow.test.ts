import { describe, expect, it } from 'vitest';
import { createLightshowSave, isLightshowComposition, lightColor, lightIntensity, parseLightshow, restoreLightshowSave } from '../lightshow';

describe('lightshow helpers', () => {
  it('accepts only lightshow payloads with supported scenes', () => {
    expect(parseLightshow({ kind: 'lightshow' })).toEqual({ scene: 'tree' });
    expect(parseLightshow({ kind: 'lightshow', scene: 'house' })).toEqual({ scene: 'house' });
    expect(parseLightshow({ kind: 'lightshow', scene: 'boat' })).toBeNull();
    expect(parseLightshow(null)).toBeNull();
  });

  it('keeps pattern output bounded and palettes repeat predictably', () => {
    expect(lightIntensity('steady', 0, 4, false)).toBe(1);
    expect(lightIntensity('fade', 1, 3, true)).toBeGreaterThanOrEqual(0.48);
    expect(lightIntensity('fade', 1, 3, true)).toBeLessThanOrEqual(1);
    expect(lightColor('warm', 0)).toBe(lightColor('warm', 3));
  });

  it('round trips a valid save and rejects malformed stored data', () => {
    const composition = { scene: 'tree', palette: 'warm', pattern: 'twinkle', speed: 3, brightness: 78 } as const;
    const stored = JSON.stringify(createLightshowSave(composition, '2026-12-07T12:00:00.000Z'));
    expect(restoreLightshowSave(stored)).toEqual(composition);
    expect(restoreLightshowSave('{bad')).toBeNull();
    expect(restoreLightshowSave(JSON.stringify({ activityId: 'wrong', schemaVersion: 1, savedAtIso: '2026-12-07T12:00:00.000Z', payload: composition }))).toBeNull();
    expect(isLightshowComposition({ ...composition, brightness: 300 })).toBe(false);
  });
});
