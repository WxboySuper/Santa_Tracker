export interface CipherConfig {
  message: string;
  shift: number;
  hint?: string;
}

const MESSAGE_PATTERN = /^(?=.*[A-Z])[A-Z ]{3,60}$/i;

function shiftMessage(message: string, shift: number): string {
  return message.replace(/[A-Z]/gi, (letter) => {
    const code = letter.toUpperCase().charCodeAt(0) - 65;
    return String.fromCharCode(((code + shift) % 26) + 65);
  });
}

export function encode(message: string, shift: number): string {
  return shiftMessage(message, shift);
}

export function decode(message: string, shift: number): string {
  return shiftMessage(message, 26 - shift);
}

export function parseCipher(payload: unknown): CipherConfig | null {
  if (!isCipherRecord(payload)) return null;
  const value = payload as Record<string, unknown>;
  if (!isCipherMessage(value.message)) return null;
  if (!isCipherShift(value.shift)) return null;
  if (!isCipherHint(value.hint)) return null;
  return { message: value.message, shift: value.shift, ...(typeof value.hint === "string" ? { hint: value.hint } : {}) };
}

function isCipherRecord(value: unknown): value is Record<string, unknown> {
  if (value === null) return false;
  if (typeof value !== "object") return false;
  return !Array.isArray(value);
}

function isCipherMessage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return MESSAGE_PATTERN.test(value);
}

function isCipherShift(value: unknown): value is number {
  if (typeof value !== "number") return false;
  if (!Number.isInteger(value)) return false;
  if (value < 1) return false;
  return value <= 25;
}

function isCipherHint(value: unknown): boolean {
  if (value === undefined) return true;
  return typeof value === "string";
}

export function normalizeCipherAnswer(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function isCipherAnswerCorrect(answer: string, message: string): boolean {
  return normalizeCipherAnswer(answer) === normalizeCipherAnswer(message);
}
