// Localization core invariants (docs/I18N.md). Key SYNC is a compile-time guarantee
// (ES/PT are Record<MsgKey, string>) — these tests cover what types can't: catalog
// hygiene (no empties, matching {slots}), interpolation, and locale switching.

import { describe, expect, it, afterEach } from 'vitest';
import { EN_KEYS, LOCALES, getLocale, setLocale, t } from './index';
import type { Locale, MsgKey } from './index';

/** Read a key under a locale, restoring the previous locale after. */
const raw = (locale: Locale, key: MsgKey): string => {
  const prev = getLocale();
  setLocale(locale);
  const v = t(key);
  setLocale(prev);
  return v;
};

afterEach(() => setLocale('en'));

describe('i18n catalogs', () => {
  it('every locale translates every key with a non-empty string', () => {
    expect(EN_KEYS.length).toBeGreaterThan(30);
    for (const locale of LOCALES) {
      for (const key of EN_KEYS) {
        const v = raw(locale, key);
        expect(v, `${locale}:${key}`).toBeTypeOf('string');
        expect(v.trim().length, `${locale}:${key} empty`).toBeGreaterThan(0);
      }
    }
  });

  it('interpolation slots match EN in every locale', () => {
    const slots = (s: string): string[] => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
    for (const key of EN_KEYS) {
      const en = slots(raw('en', key));
      for (const locale of LOCALES) {
        expect(slots(raw(locale, key)), `${locale}:${key} slots`).toEqual(en);
      }
    }
  });
});

describe('t()', () => {
  it('interpolates {var} slots', () => {
    setLocale('en');
    expect(t('liveops.endsIn', { left: '2d 14h' })).toBe('ends 2d 14h');
    expect(t('cmdname.hint.preview', { name: 'OVERMIND' })).toContain('OVERMIND');
  });

  it('leaves unknown slots literal', () => {
    setLocale('en');
    expect(t('liveops.endsIn', { nope: 1 })).toContain('{left}');
  });
});

describe('locale store', () => {
  it('switching locales changes output', () => {
    setLocale('es');
    expect(getLocale()).toBe('es');
    expect(t('nav.home')).toBe('Inicio');
    setLocale('pt');
    expect(t('nav.home')).toBe('Início');
    setLocale('en');
    expect(t('nav.home')).toBe('Home');
  });
});
