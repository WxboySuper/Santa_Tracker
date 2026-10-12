import { describe, expect, it } from 'vitest';
import { normalizeInput } from './input';

describe('input normalization', () => {
  it('maps keyboard controls', () => {
    expect(normalizeInput({ kind: 'keyboard', key: 'ArrowLeft' })).toMatchObject({ action: 'left', phase: 'start' });
    expect(normalizeInput({ kind: 'keyboard', key: 'A', type: 'keyup' })).toMatchObject({ action: 'key:a', phase: 'end' });
  });

  it('normalizes pointer and touch phases', () => {
    expect(normalizeInput({ kind: 'pointer', type: 'pointerdown', x: 4, y: 8 })).toMatchObject({
      action: 'primary',
      phase: 'start',
      x: 4,
      y: 8,
    });
    expect(normalizeInput({ kind: 'touch', type: 'touchcancel' })).toMatchObject({ phase: 'cancel' });
  });

  it('returns null for null, malformed, or unknown-kind inputs', () => {
    expect(normalizeInput(null)).toBeNull();
    expect(normalizeInput(undefined)).toBeNull();
    expect(normalizeInput({ kind: 'mouse' } as never)).toBeNull();
    expect(normalizeInput({ kind: 'keyboard' } as never)).toBeNull();
    expect(normalizeInput({ kind: 'keyboard', key: null } as never)).toBeNull();
    expect(normalizeInput({ kind: 'keyboard', key: 'ArrowLeft', type: 'keypress' } as never)).toBeNull();
  });

  it('rejects unbounded key actions and validates pointer buttons', () => {
    expect(normalizeInput({ kind: 'keyboard', key: '😀' })).toBeNull();
    expect(normalizeInput({ kind: 'keyboard', key: ' ' })).toMatchObject({ action: 'confirm' });
    expect(normalizeInput({ kind: 'pointer', button: 2 })).toMatchObject({ action: 'button:2' });
    expect(normalizeInput({ kind: 'pointer', button: Number.NaN })).toMatchObject({ action: 'primary' });
    expect(normalizeInput({ kind: 'pointer', button: 1.5 })).toMatchObject({ action: 'primary' });
    expect(normalizeInput({ kind: 'pointer', button: null as never })).toMatchObject({ action: 'primary' });
  });

  it('rejects suffix lookalikes and cross-kind event types', () => {
    expect(normalizeInput({ kind: 'pointer', type: 'mydown' as never })).toBeNull();
    expect(normalizeInput({ kind: 'pointer', type: 'touchstart' as never })).toBeNull();
    expect(normalizeInput({ kind: 'touch', type: 'pointerdown' as never })).toBeNull();
    expect(normalizeInput({ kind: 'pointer', type: 'pointerup' })).toMatchObject({ phase: 'end' });
  });

  it('sanitizes non-boolean repeat flags', () => {
    expect(normalizeInput({ kind: 'keyboard', key: 'A', repeat: 1 as never })).toMatchObject({ repeat: false });
    expect(normalizeInput({ kind: 'keyboard', key: 'A', repeat: true })).toMatchObject({ repeat: true });
  });
  it('drops non-finite coordinates and rejects unknown phases', () => {
    expect(normalizeInput({ kind: 'pointer', type: 'pointerdown', x: Number.NaN, y: 8 })).not.toHaveProperty('x');
    expect(normalizeInput({ kind: 'pointer', type: 'pointerdown', x: 1, y: Number.POSITIVE_INFINITY })).not.toHaveProperty('y');
    expect(normalizeInput({ kind: 'pointer', type: 'weird' as never })).toBeNull();
    expect(normalizeInput({ kind: 'touch', type: 'touchend' })).toMatchObject({ phase: 'end' });
  });
});
