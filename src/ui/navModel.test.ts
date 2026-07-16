// NAV MODEL CONTRACT (docs/RESPONSIVE-DESIGN.md §mobile-shell) — the automation that keeps
// FUTURE content mobile-complete. Every hub screen must (a) belong to exactly one portrait
// tab so it is reachable from the bottom bar, and (b) carry an unlock-registry def whose
// name/glyph/blurb feed the self-describing index rows. Add a screen without satisfying
// either and this suite — not a player — catches it.

import { describe, expect, it } from 'vitest';
import { mobileTabs, navGroups, tabOf, type NavKey } from './navModel';
import { featureView } from '../state/unlocks';
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
