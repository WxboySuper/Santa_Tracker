import { en, type MessageKey } from './messages';

export { en } from './messages';
export type { MessageKey, Messages } from './messages';

export type Locale = string;
export type MessageCatalog = Partial<Record<MessageKey, string>>;

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
  const locale = options.locale ?? 'en';
  const fallbackLocale = options.fallbackLocale ?? 'en';
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

const defaultTranslator = createTranslator();
export const t = (key: MessageKey, values?: Record<string, string | number>): string => defaultTranslator.t(key, values);
