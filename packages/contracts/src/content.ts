import { z } from 'zod';
import { PublicIdSchema } from './schemas';

/** BCP-47-like locale tags are data, while the text remains replaceable per locale. */
export const LocaleTagSchema = z.string().min(2).max(35).regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
export const LocalizedTextSchema = z.record(LocaleTagSchema, z.string().min(1));

export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/** Stable content identity is separate from copy and numeric ordering. */
export const LocalizedContentSchema = z.object({
  id: PublicIdSchema,
  title: LocalizedTextSchema,
  description: LocalizedTextSchema.optional(),
  order: z.number().int().nonnegative().optional(),
});

export type LocalizedContent = z.infer<typeof LocalizedContentSchema>;

export function resolveLocalizedText(text: LocalizedText, locale: string, fallbackLocale = 'en'): string | undefined {
  return text[locale] ?? text[fallbackLocale] ?? Object.values(text)[0];
}
