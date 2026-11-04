// SectionNav (docs/UI-STANDARDS.md §long-screens): the ONE long-screen pattern — chips for every
// section, folded bodies don't render, collapse state persists per device + per screen.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SectionNav, type NavSection } from './SectionNav';
import { DEVICE_PREF_KEYS, sectionPrefs, setSectionPrefs } from '../../state/prefs';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

const SECTIONS: NavSection[] = [
  { id: 'a', title: 'Alpha', render: () => createElement('p', null, 'BODY-A') },
  { id: 'b', title: 'Beta', hint: 'folded hint', defaultOpen: false, render: () => createElement('p', null, 'BODY-B') },
  { id: 'c', title: 'Gamma', count: '3/5', render: () => createElement('p', null, 'BODY-C') },
];
const html = (props: Partial<Parameters<typeof SectionNav>[0]> = {}): string =>
  renderToStaticMarkup(createElement(SectionNav, { screen: 'test', sections: SECTIONS, ...props }));

afterEach(() => vi.unstubAllGlobals());

describe('SectionNav — chips + folds', () => {
  it('renders one anchor chip per section (+ the fold-all toggle) and only OPEN bodies', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const out = html();
    expect(out.match(/class="snav-chip(?: [^"]*)?"/g)?.length).toBe(SECTIONS.length + 1);
    expect(out).toContain('BODY-A');
    expect(out).not.toContain('BODY-B'); // folded by default — its body costs nothing
    expect(out).toContain('folded hint'); // …but it reads as a table-of-contents row
    expect(out).toContain('3/5');
  });

  it('a remembered toggle beats the section default; forceOpen opens everything', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    setSectionPrefs('test', { b: true, a: false });
    const out = html();
    expect(out).toContain('BODY-B');
    expect(out).not.toContain('BODY-A');
    const forced = html({ forceOpen: true });
    for (const b of ['BODY-A', 'BODY-B', 'BODY-C']) expect(forced).toContain(b);
  });
});

describe('section prefs — per device, per screen', () => {
  it('persists toggles per screen and drops junk', () => {
    const store = memoryStorage();
    vi.stubGlobal('localStorage', store);
    setSectionPrefs('heroes', { mastery: true });
    setSectionPrefs('genes', { guide: false });
    expect(sectionPrefs('heroes')).toEqual({ mastery: true });
    expect(sectionPrefs('genes')).toEqual({ guide: false });
    store.setItem('assimilate.sections', JSON.stringify({ heroes: { mastery: 'yes', role: true } }));
    expect(sectionPrefs('heroes')).toEqual({ role: true });
  });

  it('is a registered device pref (a factory reset wipes it) and degrades without storage', () => {
    expect(DEVICE_PREF_KEYS).toContain('assimilate.sections');
    vi.stubGlobal('localStorage', undefined);
    expect(sectionPrefs('heroes')).toEqual({});
    expect(setSectionPrefs('heroes', { x: true })).toEqual({ x: true });
  });
});
