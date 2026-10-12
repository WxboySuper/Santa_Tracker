export type InputKind = 'keyboard' | 'pointer' | 'touch';
export type NormalizedInput = { kind: InputKind; action: string; phase: 'start' | 'move' | 'end' | 'cancel'; x?: number; y?: number; repeat?: boolean };
export type KeyboardInput = { kind: 'keyboard'; key: string; type?: 'keydown' | 'keyup'; repeat?: boolean };
export type PointerInput = { kind: 'pointer'; type?: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel'; button?: number; x?: number; y?: number };
export type TouchInput = { kind: 'touch'; type?: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel'; x?: number; y?: number };
const KEY_ACTIONS: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm', ' ': 'confirm', Escape: 'cancel' };
export function normalizeInput(input: KeyboardInput | PointerInput | TouchInput): NormalizedInput | null {
  if (input.kind === 'keyboard') {
    const action = KEY_ACTIONS[input.key] ?? (input.key.length === 1 ? `key:${input.key.toLowerCase()}` : null);
    if (!action) return null;
    return { kind: 'keyboard', action, phase: input.type === 'keyup' ? 'end' : 'start', repeat: input.repeat ?? false };
  }
  const phase = input.type?.endsWith('cancel') ? 'cancel' : input.type?.endsWith('up') || input.type === 'touchend' ? 'end' : input.type?.endsWith('move') ? 'move' : 'start';
  return { kind: input.kind, action: input.kind === 'pointer' && input.button !== undefined && input.button !== 0 ? `button:${input.button}` : 'primary', phase, x: input.x, y: input.y };
}
