export interface CipherConfig {
  message: string;
  shift: number;
  hint?: string;
}

const MESSAGE_PATTERN = /^[A-Z ]{3,60}$/i;

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
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  if (typeof value.message !== "string" || !MESSAGE_PATTERN.test(value.message)) return null;
  if (typeof value.shift !== "number" || !Number.isInteger(value.shift) || value.shift < 1 || value.shift > 25) return null;
  if (value.hint !== undefined && typeof value.hint !== "string") return null;
  return { message: value.message, shift: value.shift, ...(typeof value.hint === "string" ? { hint: value.hint } : {}) };
}

export function normalizeCipherAnswer(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function isCipherAnswerCorrect(answer: string, message: string): boolean {
  return normalizeCipherAnswer(answer) === normalizeCipherAnswer(message);
}
