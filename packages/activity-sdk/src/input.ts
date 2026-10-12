export type InputKind = 'keyboard' | 'pointer' | 'touch';
export type NormalizedInput = { kind: InputKind; action: string; phase: 'start' | 'move' | 'end' | 'cancel'; x?: number; y?: number; repeat?: boolean };
export type KeyboardInput = { kind: 'keyboard'; key: string; type?: 'keydown' | 'keyup'; repeat?: boolean };
export type PointerInput = { kind: 'pointer'; type?: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel'; button?: number; x?: number; y?: number };
export type TouchInput = { kind: 'touch'; type?: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel'; x?: number; y?: number };
export type AnyActivityInput = KeyboardInput | PointerInput | TouchInput;

const KEY_ACTIONS: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm', ' ': 'confirm', Escape: 'cancel' };

function keyboardAction(key: unknown): string | null {
  if (typeof key !== 'string' || key.length === 0) return null;
  const mapped = KEY_ACTIONS[key];
  if (mapped) return mapped;
  if (key.length === 1 && /[a-z0-9]/i.test(key)) return `key:${key.toLowerCase()}`;
  return null;
}

function keyboardPhase(type: unknown): NormalizedInput['phase'] | null {
  if (type === undefined || type === 'keydown') return 'start';
  if (type === 'keyup') return 'end';
  return null;
}

const POINTER_TYPES = new Set(['pointerdown', 'pointermove', 'pointerup', 'pointercancel']);
const TOUCH_TYPES = new Set(['touchstart', 'touchmove', 'touchend', 'touchcancel']);

function pointerOrTouchPhase(kind: 'pointer' | 'touch', type: unknown): NormalizedInput['phase'] | null {
  if (type === undefined) return 'start';
  if (typeof type !== 'string') return null;
  const allowed = kind === 'pointer' ? POINTER_TYPES : TOUCH_TYPES;
  if (!allowed.has(type)) return null;
  if (type.endsWith('cancel')) return 'cancel';
  if (type.endsWith('up') || type === 'touchend') return 'end';
  if (type.endsWith('move')) return 'move';
  return 'start';
}

function pointerAction(input: { button?: unknown }): string {
  const button: unknown = input.button;
  return typeof button === 'number' && Number.isInteger(button) && button !== 0 ? `button:${button}` : 'primary';
}

function finiteCoordinate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeKeyboard(value: object): NormalizedInput | null {
  const keyboard = value as KeyboardInput;
  const action = keyboardAction(keyboard.key);
  if (!action) return null;
  const phase = keyboardPhase(keyboard.type);
  if (!phase) return null;
  return { kind: 'keyboard', action, phase, repeat: keyboard.repeat === true };
}

function normalizePointerOrTouch(kind: 'pointer' | 'touch', value: object): NormalizedInput | null {
  const source = value as { type?: unknown; x?: unknown; y?: unknown; button?: unknown };
  const phase = pointerOrTouchPhase(kind, source.type);
  if (!phase) return null;
  const action = kind === 'pointer' ? pointerAction(source) : 'primary';
  const result: NormalizedInput = { kind, action, phase };
  const x = finiteCoordinate(source.x);
  if (x !== undefined) result.x = x;
  const y = finiteCoordinate(source.y);
  if (y !== undefined) result.y = y;
  return result;
}

export function normalizeInput(input: AnyActivityInput | null | undefined): NormalizedInput | null {
  if (typeof input !== 'object' || input === null) return null;
  const kind: unknown = (input as { kind?: unknown }).kind;
  if (kind === 'keyboard') return normalizeKeyboard(input);
  if (kind === 'pointer' || kind === 'touch') return normalizePointerOrTouch(kind, input);
  return null;
}
