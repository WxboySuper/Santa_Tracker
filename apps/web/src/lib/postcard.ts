import { migrateActivitySave, type ActivitySaveEnvelope } from "@santa-tracker/activity-sdk/save";
import { createActivityId } from "@santa-tracker/contracts";

export type WinterScene = "cabin" | "harbor" | "street" | "forest";
export type PostcardConfig = { scene: WinterScene };
export type PostcardContent = { scene: WinterScene; greeting: string; signoff: string; city: string; date: string; includePostmark: boolean };
export type PostcardLayout = { greeting: string[]; signoff: string[]; postmark: string[] };
type PostcardTextInput = { value: string; maximum?: number };
type PostcardInputLimit = { value: string; maximum: number };
type TextWrapContext = { value: string; maxWidth: number; fontSize: number };
type TextMeasureContext = { value: string; fontSize: number };
type LongWordContext = { word: string; maxWidth: number; fontSize: number };
type CharacterContext = { character: string };
type PostcardSaveContext = { payload: Pick<PostcardContent, "scene" | "greeting" | "signoff" | "city" | "date" | "includePostmark">; savedAtIso?: string };
type PostcardRestoreContext = { raw: string | null };

const scenes: readonly WinterScene[] = ["cabin", "harbor", "street", "forest"];
const postcardId = createActivityId("advent-postcard");

export function parsePostcard(payload: unknown): PostcardConfig | null {
  return parsePostcardPayload({ payload });
}

export function sanitizePostcardText({ value, maximum = 140 }: PostcardTextInput): string {
  const plainText = stripMarkup({ value }).replace(/\s+/g, " ").trim();
  return Array.from(plainText).slice(0, maximum).join("");
}

export function limitPostcardInput({ value, maximum }: PostcardInputLimit): string {
  return Array.from(value).slice(0, maximum).join("");
}

export function wrapPostcardText({ value, maxWidth, fontSize }: TextWrapContext): string[] {
  const words = sanitizePostcardText({ value }).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const chunks = splitLongWord({ word, maxWidth, fontSize });
    for (const chunk of chunks) {
      const candidate = line ? `${line} ${chunk}` : chunk;
      if (!line) {
        line = chunk;
        continue;
      }
      if (measureText({ value: candidate, fontSize }) > maxWidth) {
        lines.push(line);
        line = chunk;
        continue;
      }
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function layoutPostcard(content: Pick<PostcardContent, "greeting" | "signoff" | "city" | "date" | "includePostmark">): PostcardLayout {
  const cityLines = content.includePostmark ? wrapPostcardText({ value: content.city, maxWidth: 440, fontSize: 20 }).slice(0, 2) : [];
  const dateLine = content.includePostmark ? wrapPostcardText({ value: content.date, maxWidth: 440, fontSize: 20 }).slice(0, 1) : [];
  return {
    greeting: wrapPostcardText({ value: content.greeting, maxWidth: 1040, fontSize: 36 }).slice(0, 4),
    signoff: wrapPostcardText({ value: content.signoff, maxWidth: 1040, fontSize: 30 }).slice(0, 2),
    postmark: [...cityLines, ...dateLine],
  };
}

export function createPostcardSave({ payload, savedAtIso = new Date().toISOString() }: PostcardSaveContext): ActivitySaveEnvelope<typeof payload> {
  return { activityId: postcardId, schemaVersion: 1, savedAtIso, payload: {
    ...payload,
    greeting: sanitizePostcardText({ value: payload.greeting }),
    signoff: sanitizePostcardText({ value: payload.signoff }),
    city: sanitizePostcardText({ value: payload.city }),
    date: sanitizePostcardText({ value: payload.date }),
  } };
}

export function restorePostcardSave({ raw }: PostcardRestoreContext): PostcardContent | null {
  if (!raw) return null;
  try {
    const envelope = migrateActivitySave<unknown>(JSON.parse(raw), 1, []);
    if (envelope.activityId !== postcardId) return null;
    return parseSavedPostcard({ value: envelope.payload });
  } catch {
    return null;
  }
}

function parseSavedPostcard({ value }: { value: unknown }): PostcardContent | null {
  const record = parseRecord({ value });
  if (record === null) return null;
  const scene = parseScene({ value: record.scene });
  if (scene === null) return null;
  if (typeof record.greeting !== "string") return null;
  if (typeof record.signoff !== "string") return null;
  if (typeof record.city !== "string") return null;
  if (typeof record.date !== "string") return null;
  if (typeof record.includePostmark !== "boolean") return null;
  return {
    scene,
    greeting: sanitizePostcardText({ value: record.greeting }),
    signoff: sanitizePostcardText({ value: record.signoff }),
    city: sanitizePostcardText({ value: record.city }),
    date: sanitizePostcardText({ value: record.date }),
    includePostmark: record.includePostmark,
  };
}

function splitLongWord({ word, maxWidth, fontSize }: LongWordContext): string[] {
  const chunks: string[] = [];
  let chunk = "";
  for (const character of Array.from(word)) {
    if (!chunk) {
      chunk = character;
      continue;
    }
    if (measureText({ value: chunk + character, fontSize }) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
      continue;
    }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function measureText({ value, fontSize }: TextMeasureContext): number {
  return Array.from(value).reduce((width, character) => width + fontSize * glyphWidth({ character }), 0);
}

function glyphWidth({ character }: CharacterContext): number {
  if (/\s/.test(character)) return 0.3;
  if (/\p{Extended_Pictographic}/u.test(character)) return 1;
  if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(character)) return 1;
  return 0.56;
}

function isControlCharacter({ character }: CharacterContext): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}

function stripMarkup({ value }: { value: string }): string {
  const characters = Array.from(value);
  const plainText: string[] = [];
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? "";
    if (character === "<") {
      const tagEnd = findTagEnd({ characters, start: index });
      if (tagEnd !== null) {
        index = tagEnd;
        continue;
      }
    }
    plainText.push(isControlCharacter({ character }) ? " " : character);
  }
  return plainText.join("");
}

function findTagEnd({ characters, start }: { characters: string[]; start: number }): number | null {
  const first = characters[start + 1];
  const nameStart = first === "/" ? start + 2 : start + 1;
  if (!/^[A-Za-z]$/.test(characters[nameStart] ?? "")) return null;
  for (let index = nameStart + 1; index < characters.length; index += 1) {
    if (characters[index] === "<") return null;
    if (characters[index] === ">") return index;
  }
  return null;
}

function parsePostcardPayload({ payload }: { payload: unknown }): PostcardConfig | null {
  const record = parseRecord({ value: payload });
  if (record === null) return null;
  if (record.kind !== "postcard") return null;
  if (record.scene === undefined) return { scene: "cabin" };
  const scene = parseScene({ value: record.scene });
  return scene === null ? null : { scene };
}

function parseScene({ value }: { value: unknown }): WinterScene | null {
  return scenes.includes(value as WinterScene) ? value as WinterScene : null;
}

function parseRecord({ value }: { value: unknown }): Record<string, unknown> | null {
  if (value === null) return null;
  if (typeof value !== "object") return null;
  if (Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
