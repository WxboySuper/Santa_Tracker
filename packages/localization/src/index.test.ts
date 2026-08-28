import { describe, expect, it } from 'vitest';
import { createTranslator } from './index';

describe('@santa-tracker/localization', () => {
  it('uses the requested locale and interpolates values', () => {
    const translator = createTranslator({
      locale: 'de',
      catalogs: { de: { 'nav.home': 'Start', 'tracker.loaded': '{count} Haltepunkte geladen' } },
    });

    expect(translator.t('nav.home')).toBe('Start');
    expect(translator.t('tracker.loaded', { count: 4 })).toBe('4 Haltepunkte geladen');
  });

  it('falls back to English when a locale or message is missing', () => {
    const translator = createTranslator({ locale: 'fr', catalogs: { fr: { 'nav.home': 'Accueil' } } });

    expect(translator.t('nav.home')).toBe('Accueil');
    expect(translator.t('home.trackSanta')).toBe('Track Santa');
  });

  it('returns the stable message key for an unknown runtime key', () => {
    const translator = createTranslator({ catalogs: { en: {} } });
    expect(translator.t('nav.home')).toBe('nav.home');
  });

  it('leaves an interpolation marker visible when its value is missing', () => {
    const translator = createTranslator();
    expect(translator.t('advent.day', { day: 1 })).toBe('Day 1: {title}');
  });
});
