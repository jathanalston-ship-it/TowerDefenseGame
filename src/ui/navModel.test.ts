// NAV MODEL CONTRACT (docs/RESPONSIVE-DESIGN.md §mobile-shell) — the automation that keeps
// FUTURE content mobile-complete. Every hub screen must (a) belong to exactly one portrait
// tab so it is reachable from the bottom bar, and (b) carry an unlock-registry def whose
// name/glyph/blurb feed the self-describing index rows. Add a screen without satisfying
// either and this suite — not a player — catches it.

import { describe, expect, it } from 'vitest';
import { FOLDED_NAVS, foldCounts, foldedInto, groupOf, hostOf, mobileTabs, navGroups, navLabel, tabOf, type NavKey } from './navModel';
import { readFileSync } from 'node:fs';
import { FEATURE_BY_ID, featureView } from '../state/unlocks';
import { SCREEN_NAMES, setLocale } from '../i18n';
import { defaultSave } from '../save/saveStore';

const allNavKeys = (): NavKey[] => navGroups().flatMap((g) => g.items.map((i) => i.key));

describe('navModel — portrait tab shell contract', () => {
  it('every nav screen lives in exactly ONE portrait tab (bottom-bar reachability)', () => {
    const seen = new Map<string, number>();
    for (const tab of mobileTabs()) {
      for (const k of tab.navs) seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    for (const k of allNavKeys()) {
      expect(seen.get(k), `screen '${k}' must appear in exactly one mobile tab`).toBe(1);
    }
    // And nothing phantom: tabs may not reference screens the groups don't know.
    const known = new Set<string>(allNavKeys());
    for (const tab of mobileTabs()) for (const k of tab.navs) expect(known.has(k), `tab '${tab.key}' references unknown screen '${k}'`).toBe(true);
  });

  it('tabOf() resolves every screen to its owning tab', () => {
    for (const k of allNavKeys()) {
      const tab = tabOf(k);
      expect(mobileTabs().find((tb) => tb.key === tab)?.navs.includes(k), `tabOf('${k}') → '${tab}' must own it`).toBe(true);
    }
  });

  it('the bar stays a five-tab thumb layout with short labels and glyphs', () => {
    const tabs = mobileTabs();
    expect(tabs.length).toBe(5);
    expect(tabs.map((tb) => tb.key)).toEqual(['home', 'battle', 'rewards', 'evolve', 'more']);
    for (const tb of tabs) {
      expect(tb.label.length, `tab '${tb.key}' label '${tb.label}' must fit under a glyph`).toBeLessThanOrEqual(10);
      expect(tb.glyph.length).toBeGreaterThan(0);
    }
  });

  it('every nav screen has an unlock-registry def — the index rows are always self-describing', () => {
    const save = defaultSave();
    for (const k of allNavKeys()) {
      const view = featureView(save, k); // throws on unknown id
      expect(view.def.name.length, `feature '${k}' needs a name`).toBeGreaterThan(0);
      expect(view.def.glyph.length, `feature '${k}' needs a glyph`).toBeGreaterThan(0);
      expect(view.def.blurb.length, `feature '${k}' needs a first-timer blurb (the mobile index row)`).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('navModel — folded screens (side screens live as host tabs)', () => {
  const folded = Object.keys(FOLDED_NAVS) as NavKey[];

  it('the nav lists 27 destinations; the five folded screens are tabs, not rows', () => {
    expect(allNavKeys().length).toBe(27); // +Class Bonds (2026-11-06, docs/CLASS-BONDS.md)
    expect(folded.sort()).toEqual(['expeditions', 'gearcodex', 'harvest', 'metabolism', 'specimens']);
    for (const k of folded) expect(allNavKeys(), `${k} must not be a nav row`).not.toContain(k);
  });

  it('every folded key deep-links to a REAL nav host in the same hub + portrait tab', () => {
    const rows = new Set<string>(allNavKeys());
    for (const k of folded) {
      const host = hostOf(k);
      expect(rows.has(host), `${k} → host '${host}' must be a nav row`).toBe(true);
      expect(FOLDED_NAVS[host], `host '${host}' must not itself be folded`).toBeUndefined();
      expect(groupOf(k).id).toBe(groupOf(host).id);
      expect(tabOf(k)).toBe(tabOf(host));
      expect(foldedInto(host)).toContain(k);
    }
    expect(hostOf('towers')).toBe('towers'); // unfolded keys are their own host
  });

  it('folded badges light their host (a ripe Production tab badges The Hive)', () => {
    expect(foldCounts({ harvest: 1, expeditions: 2, hive: 1, towers: 3 })).toEqual({ hive: 4, towers: 3 });
  });

  it('each host component renders its own tab strip (not the Hub render switch)', () => {
    const hub = readFileSync('src/ui/Hub.tsx', 'utf-8');
    for (const k of folded) expect(hub, `Hub must not render folded '${k}' directly`).not.toContain(`nav === '${k}'`);
    const hostFile: Record<string, string> = { hive: 'src/ui/HiveScreen.tsx', quests: 'src/ui/QuestBoard.tsx', phenotypes: 'src/ui/Wardrobe.tsx', equipment: 'src/ui/EquipmentPanel.tsx' };
    for (const host of new Set(folded.map(hostOf))) {
      const src = readFileSync(hostFile[host], 'utf-8');
      expect(src, `${host} host must mount <HostedScreen host="${host}">`).toContain(`<HostedScreen host="${host}"`);
      for (const k of foldedInto(host)) expect(src, `${host} must carry a '${k}' view`).toContain(`${k}:`);
    }
  });
});

describe('navModel — ONE name per screen (docs/UI-STANDARDS.md §naming)', () => {
  const everyKey = (): NavKey[] => [...allNavKeys(), ...(Object.keys(FOLDED_NAVS) as NavKey[])];

  it('every nav label equals its feature-registry name, and every mono its glyph', () => {
    setLocale('en');
    for (const g of navGroups()) {
      for (const i of g.items) {
        const def = FEATURE_BY_ID.get(i.key)!;
        expect(i.label, `nav '${i.key}' label must be the registry name`).toBe(def.name);
        expect(i.mono, `nav '${i.key}' mono must be the registry glyph`).toBe(def.glyph);
      }
    }
    for (const k of everyKey()) expect(navLabel(k)).toBe(FEATURE_BY_ID.get(k)!.name);
  });

  it('no two screens share a name, and no screen icon is a bare letter', () => {
    const names = everyKey().map((k) => FEATURE_BY_ID.get(k)!.name.toLowerCase());
    expect(new Set(names).size, `duplicate screen names: ${names.join(', ')}`).toBe(names.length);
    for (const k of everyKey()) expect(FEATURE_BY_ID.get(k)!.glyph, `'${k}' needs a real glyph (docs/ICON-LANGUAGE.md)`).not.toMatch(/^[A-Za-z]$/);
    // "Vault" names exactly ONE place (the Genetic Vault) — the specimen screen is the Cabinet.
    expect(names.filter((n) => /\bvault\b/.test(n))).toEqual(['genetic vault']);
  });

  it('every locale names every screen (translations keyed by screen id)', () => {
    for (const locale of Object.keys(SCREEN_NAMES) as (keyof typeof SCREEN_NAMES)[]) {
      for (const k of everyKey()) expect(SCREEN_NAMES[locale][k]?.trim(), `${locale}: missing screen name '${k}'`).toBeTruthy();
    }
    setLocale('es');
    try {
      expect(navGroups().flatMap((g) => g.items).find((i) => i.key === 'equipment')?.label).toBe(SCREEN_NAMES.es.equipment);
    } finally {
      setLocale('en');
    }
  });
});
