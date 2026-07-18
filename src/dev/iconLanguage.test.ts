// ICON LANGUAGE enforcement (docs/ICON-LANGUAGE.md) — the inheritance contract. Every
// player-facing concept axis must resolve to a visual identity, and glyphs stay unique
// within an axis. A NEW currency / reward type / status / screen without a face fails here —
// future systems inherit the standard automatically or the build goes red.

import { describe, expect, it } from 'vitest';
import { ACTIONS, STATS, STATUS_GLYPHS, statusIcon } from '../ui/iconLanguage';
import { CURRENCIES, currencyProblems } from '../core/currencies';
import { REWARD_TYPES } from '../state/rewardToast';
import { EFFECT_CATEGORIES } from '../core/effectLanguage';
import { statusRegistry } from '../core/status';
import { navGroups } from '../ui/navModel';
import { FEATURES } from '../state/unlocks';

function uniqueGlyphs(name: string, rows: { glyph: string }[]): void {
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.glyph, (seen.get(r.glyph) ?? 0) + 1);
  const dupes = [...seen].filter(([, n]) => n > 1).map(([g]) => g);
  expect(dupes, `${name}: duplicate glyphs within the axis: ${dupes.join(' ')}`).toEqual([]);
}

describe('icon language — every axis fully covered', () => {
  it('every ACTION has glyph + tokenized color + label', () => {
    for (const [id, d] of Object.entries(ACTIONS)) {
      expect(d.glyph.length, `${id}: glyph`).toBeGreaterThan(0);
      expect(d.label.length, `${id}: label`).toBeGreaterThan(0);
      expect(d.color.startsWith('var(--'), `${id}: color must be a CSS token, got '${d.color}'`).toBe(true);
    }
    uniqueGlyphs('ACTIONS', Object.values(ACTIONS));
  });

  it('every STATUS EFFECT in the registry has a player glyph (new statuses must add one)', () => {
    for (const d of statusRegistry.active()) {
      expect(STATUS_GLYPHS[d.id], `status '${d.id}' has no player glyph in STATUS_GLYPHS`).toBeTruthy();
      const icon = statusIcon(d.id)!;
      expect(icon.color).toBe(d.color); // sim def stays the color source of truth
      expect(icon.label).toBe(d.name);
    }
    uniqueGlyphs('STATUS_GLYPHS', Object.values(STATUS_GLYPHS).map((glyph) => ({ glyph })));
  });

  it('every CURRENCY has its full visual identity (color/glow/silhouette validator)', () => {
    expect(currencyProblems()).toEqual([]);
    for (const d of Object.values(CURRENCIES)) expect(d.color.trim().length).toBeGreaterThan(0);
  });

  it('every REWARD TYPE carries art (currency ref, glyph, or bespoke kind)', () => {
    for (const t of REWARD_TYPES) {
      if (t.art.kind === 'glyph') {
        expect(t.art.glyph.length, `reward '${t.id}': empty glyph`).toBeGreaterThan(0);
        expect(t.art.color.length, `reward '${t.id}': empty color`).toBeGreaterThan(0);
      } else if (t.art.kind === 'currency') {
        expect(CURRENCIES[t.art.id as keyof typeof CURRENCIES], `reward '${t.id}': unknown currency '${t.art.id}'`).toBeTruthy();
      } // container/gene render bespoke art — their existence IS the identity
    }
  });

  it('every NAV SCREEN and every FEATURE row has a glyph', () => {
    for (const g of navGroups()) {
      expect(g.hub.glyph.length, `hub '${g.id}': no glyph`).toBeGreaterThan(0);
      for (const i of g.items) expect(i.mono.length, `nav '${i.key}': no mono glyph`).toBeGreaterThan(0);
    }
    for (const f of FEATURES) expect(f.glyph.length, `feature '${f.id}': no glyph`).toBeGreaterThan(0);
  });

  it('effect categories keep glyph + color + label (the combat-language axis)', () => {
    for (const [id, d] of Object.entries(EFFECT_CATEGORIES)) {
      expect(d.glyph.length, `${id}: glyph`).toBeGreaterThan(0);
      expect(d.color.length, `${id}: color`).toBeGreaterThan(0);
      expect(d.label.length, `${id}: label`).toBeGreaterThan(0);
    }
    uniqueGlyphs('EFFECT_CATEGORIES', Object.values(EFFECT_CATEGORIES));
    // STATS is not uniqueness-checked: it deliberately ALIASES effect-category glyphs where
    // the concept is identical (dps/damage ▲, cadence ≫, crit ✦) — the concept-family rule.
    for (const [id, d] of Object.entries(STATS)) {
      expect(d.glyph.length, `stat '${id}': glyph`).toBeGreaterThan(0);
      expect(d.label.length, `stat '${id}': label`).toBeGreaterThan(0);
    }
  });
});
