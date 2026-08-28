import { en, type MessageKey } from './messages';

export { en } from './messages';
export type { MessageKey, Messages } from './messages';

export type Locale = string;
export type MessageCatalog = Partial<Record<MessageKey, string>>;
export const DEFAULT_LOCALE = 'en' as const;
export const SUPPORTED_LOCALES = [DEFAULT_LOCALE] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function negotiateLocale(acceptLanguage: string | null | undefined): SupportedLocale {
  const requested = (acceptLanguage ?? '')
    .split(',')
    .map(part => {
      const qualityMatch = /q=([0-9.]+)/.exec(part);
      const hasQuality = /(?:^|;)\s*q=/i.test(part);
      const quality = hasQuality ? Number(qualityMatch?.[1]) : 1;
      return { language: part.trim().split(';')[0]?.toLowerCase() ?? '', quality };
    })
    .filter(item => item.language && Number.isFinite(item.quality) && item.quality > 0)
    .sort((a, b) => b.quality - a.quality);
  for (const item of requested) {
    if (item.language === '*') return SUPPORTED_LOCALES[0];
    const match = SUPPORTED_LOCALES.find(locale => item.language === locale || item.language.startsWith(`${locale}-`));
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

export interface TranslatorOptions {
  locale?: Locale;
  fallbackLocale?: Locale;
  catalogs?: Record<Locale, MessageCatalog>;
}

export interface Translator {
  locale: Locale;
  t(key: MessageKey, values?: Record<string, string | number>): string;
}

const defaultCatalogs: Record<Locale, MessageCatalog> = { en };

export function createTranslator(options: TranslatorOptions = {}): Translator {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const fallbackLocale = options.fallbackLocale ?? DEFAULT_LOCALE;
  const catalogs = { ...defaultCatalogs, ...options.catalogs };
  const localeCatalog = catalogs[locale] ?? {};
  const fallbackCatalog = catalogs[fallbackLocale] ?? en;

  const translate = (key: MessageKey, values: Record<string, string | number> = {}): string => {
      const template = localeCatalog[key] ?? fallbackCatalog[key] ?? key;
      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        Object.hasOwn(values, name) ? String(values[name]) : match,
      );
  };

  return {
    locale,
    t: translate,
  };
}
