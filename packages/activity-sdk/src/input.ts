export type InputKind = 'keyboard' | 'pointer' | 'touch';
export type NormalizedInput = { kind: InputKind; action: string; phase: 'start' | 'move' | 'end' | 'cancel'; x?: number; y?: number; repeat?: boolean };
export type KeyboardInput = { kind: 'keyboard'; key: string; type?: 'keydown' | 'keyup'; repeat?: boolean };
export type PointerInput = { kind: 'pointer'; type?: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel'; button?: number; x?: number; y?: number };
export type TouchInput = { kind: 'touch'; type?: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel'; x?: number; y?: number };
const KEY_ACTIONS: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm', ' ': 'confirm', Escape: 'cancel' };
function keyboardAction(key: string): string | null {
  return KEY_ACTIONS[key] ?? (key.length === 1 ? `key:${key.toLowerCase()}` : null);
}
function pointerOrTouchPhase(type: PointerInput['type'] | TouchInput['type']): NormalizedInput['phase'] {
  if (type?.endsWith('cancel')) return 'cancel';
  if (type?.endsWith('up') || type === 'touchend') return 'end';
  if (type?.endsWith('move')) return 'move';
  return 'start';
}
function pointerAction(input: PointerInput): string {
  return input.button !== undefined && input.button !== 0 ? `button:${input.button}` : 'primary';
}
export function normalizeInput(input: KeyboardInput | PointerInput | TouchInput): NormalizedInput | null {
  if (input.kind === 'keyboard') {
    const action = keyboardAction(input.key);
    if (!action) return null;
    return { kind: 'keyboard', action, phase: input.type === 'keyup' ? 'end' : 'start', repeat: input.repeat ?? false };
  }
  const action = input.kind === 'pointer' ? pointerAction(input) : 'primary';
  return { kind: input.kind, action, phase: pointerOrTouchPhase(input.type), x: input.x, y: input.y };
}
