// Effect language (docs/CARDS.md §language) — the universal descriptive-language contract:
// digit-free primary text for every card at every level, full vocabulary coverage, a
// monotonic impact scale, and phrasing that can never collide across different effects.

import { describe, expect, it } from 'vitest';
import {
  describeCard,
  describeEffects,
  EFFECT_CATEGORIES,
  FIELD_VOCAB,
  foldEffects,
  IMPACT_SCALE,
  impactTier,
  lineText,
} from './effectLanguage';
import { CARD_POOL, defaultRunModifiers } from './cards';
import type { CardDef, CardEffect } from './cards';
import { effectiveGeneEffects, geneMaxLevel } from './geneCards';

describe('impact scale', () => {
  it('has the 8 standardized descriptors, weakest → strongest', () => {
    expect(IMPACT_SCALE.map((t) => t.adverb)).toEqual([
      'Very Slightly', 'Slightly', 'Moderately', 'Significantly',
      'Greatly', 'Massively', 'Extremely', 'Overwhelmingly',
    ]);
  });

  it('bands start at 0 and strictly increase (configurable, never overlapping)', () => {
    expect(IMPACT_SCALE[0].min).toBe(0);
    for (let i = 1; i < IMPACT_SCALE.length; i++) {
      expect(IMPACT_SCALE[i].min).toBeGreaterThan(IMPACT_SCALE[i - 1].min);
    }
  });

  it('impactTier is monotonic in magnitude', () => {
    let prev = 0;
    for (let m = 0; m <= 3; m += 0.01) {
      const t = impactTier(m);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    expect(impactTier(0)).toBe(0);
    expect(impactTier(999)).toBe(IMPACT_SCALE.length - 1);
  });
});

describe('category palette', () => {
  it('carries the 12 game-wide effect categories with color + glyph + label', () => {
    const labels = Object.values(EFFECT_CATEGORIES).map((c) => c.label);
    expect(labels).toEqual([
      'Damage', 'Attack Speed', 'Critical', 'Biomass Economy', 'Genome Core Economy',
      'Gene Essence', 'Defense', 'Healing', 'Debuffs', 'Crowd Control', 'Hero Effects', 'Tower Effects',
    ]);
    for (const c of Object.values(EFFECT_CATEGORIES)) {
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.glyph.length).toBeGreaterThan(0);
    }
    // Glyphs are the colorblind identity channel — they must be distinct.
    expect(new Set(Object.values(EFFECT_CATEGORIES).map((c) => c.glyph)).size).toBe(12);
  });
});

describe('vocabulary coverage', () => {
  it('covers every numeric RunModifiers field (future cards auto-describe)', () => {
    const mods = defaultRunModifiers() as unknown as Record<string, unknown>;
    for (const [field, v] of Object.entries(mods)) {
      if (typeof v !== 'number') continue;
      expect(FIELD_VOCAB[field as keyof typeof FIELD_VOCAB], `vocab for '${field}'`).toBeTruthy();
    }
  });

  it('describes every boolean RunModifiers field via flag vocab', () => {
    const mods = defaultRunModifiers() as unknown as Record<string, unknown>;
    for (const [field, v] of Object.entries(mods)) {
      if (typeof v !== 'boolean') continue;
      const lines = describeEffects([{ op: 'flag', field } as CardEffect]);
      expect(lines.length, `flag vocab for '${field}'`).toBe(1);
    }
  });

  it('every vocab category is in the palette', () => {
    for (const v of Object.values(FIELD_VOCAB)) {
      if (v) expect(Object.keys(EFFECT_CATEGORIES)).toContain(v.cat);
    }
  });
});

describe('generated card language', () => {
  it('every pool card yields lines, digit-free, at base AND max permanent level', () => {
    for (const def of CARD_POOL) {
      for (const level of [0, geneMaxLevel(def)]) {
        const fx = effectiveGeneEffects(def, level);
        const { lines } = describeCard(def, fx);
        expect(lines.length, `${def.id} L${level} has no lines`).toBeGreaterThan(0);
        for (const l of lines) {
          expect(lineText(l), `${def.id} L${level} leaks digits: "${lineText(l)}"`).not.toMatch(/\d/);
        }
      }
    }
  });

  it('identical text always means the same effect shape (no misleading collisions)', () => {
    const byText = new Map<string, string>();
    for (const def of CARD_POOL) {
      const { lines } = describeCard(def);
      const text = lines.map(lineText).join(' ');
      const signature = [...new Set(def.effects.map((e) => ('field' in e ? `${e.op}.${e.field}` : e.op)))].sort().join('|');
      const prior = byText.get(text);
      if (prior !== undefined) {
        expect(prior, `"${text}" is shared by cards with different effect shapes`).toBe(signature);
      } else {
        byText.set(text, signature);
      }
    }
  });

  it('drawbacks read as warnings and sort last', () => {
    const glass = CARD_POOL.find((c) => c.id === 'glass_genome')!;
    const { lines } = describeCard(glass);
    const last = lines[lines.length - 1];
    expect(last.good).toBe(false);
    expect(last.pre.startsWith('But ')).toBe(true);
    expect(lineText(last)).toContain('enemy health');
    expect(lines[0].good).toBe(true); // the ×2 buff leads
    expect(lines[0].tier).toBe(6); // ×2 ⇒ magnitude 1.0 ⇒ Extremely
  });

  it('exact strings keep the real numbers for the detail expansion', () => {
    const sharp = CARD_POOL.find((c) => c.id === 'sharpened_needles')!;
    const { lines, exact } = describeCard(sharp);
    expect(lines[0].exact).toContain('+12%');
    expect(exact.join(' ')).toContain('tower damage');
    const glass = describeCard(CARD_POOL.find((c) => c.id === 'glass_genome')!);
    expect(glass.exact.some((e) => e.startsWith('×2'))).toBe(true);
  });

  it('a leveled card folds same-field upgrades into ONE stronger line', () => {
    const sharp = CARD_POOL.find((c) => c.id === 'sharpened_needles')!;
    const base = describeCard(sharp, effectiveGeneEffects(sharp, 0));
    const maxed = describeCard(sharp, effectiveGeneEffects(sharp, geneMaxLevel(sharp)));
    const dmgLines = (ls: { keyword: string }[]) => ls.filter((l) => l.keyword === 'tower damage').length;
    expect(dmgLines(base.lines)).toBe(1);
    expect(dmgLines(maxed.lines)).toBe(1); // merged, never repeated fragments
    expect(maxed.lines[0].tier).toBeGreaterThanOrEqual(base.lines[0].tier);
    expect(maxed.powerMult).toBeGreaterThan(base.powerMult);
  });

  it('reduction buffs phrase as reductions; instants use adjective infusions', () => {
    const stims = describeCard(CARD_POOL.find((c) => c.id === 'combat_stims')!);
    expect(lineText(stims.lines[0])).toBe('Slightly reduces Hero ability cooldown.');
    expect(stims.lines[0].good).toBe(true);
    const surge = describeCard(CARD_POOL.find((c) => c.id === 'biomass_surge')!);
    expect(lineText(surge.lines[0])).toBe('Instantly grants a Moderate infusion of Biomass.');
    // Article agreement at high tiers ("an Extreme…").
    const big = describeEffects([{ op: 'biomass', value: 1000 }]);
    expect(lineText(big[0])).toContain('an Extreme infusion');
  });

  it('honors the hand-written `simple` override, keeping derived exacts', () => {
    const def: CardDef = {
      id: 'x_test', name: 'X', rarity: 'common', category: 'tower',
      description: '+12% tower damage.', simple: 'Hardens every needle in the Hive.',
      effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.12 }],
    };
    const { lines, exact } = describeCard(def);
    expect(lines).toHaveLength(1);
    expect(lineText(lines[0])).toBe('Hardens every needle in the Hive.');
    expect(exact[0]).toContain('+12%');
  });
});

describe('foldEffects', () => {
  it('compounds muls, sums adds/instants, dedupes flags, keeps author order', () => {
    const folded = foldEffects([
      { op: 'mul', field: 'towerDamageMult', value: 1.1 },
      { op: 'flag', field: 'mortarAppliesFracture' },
      { op: 'mul', field: 'towerDamageMult', value: 1.2 },
      { op: 'add', field: 'fractureBonusStacks', value: 2 },
      { op: 'flag', field: 'mortarAppliesFracture' },
      { op: 'add', field: 'fractureBonusStacks', value: 3 },
      { op: 'biomass', value: 100 },
      { op: 'biomass', value: 50 },
    ]);
    expect(folded).toHaveLength(4);
    expect(folded[0]).toEqual({ op: 'mul', field: 'towerDamageMult', value: 1.1 * 1.2 });
    expect(folded[1]).toEqual({ op: 'flag', field: 'mortarAppliesFracture' });
    expect(folded[2]).toEqual({ op: 'add', field: 'fractureBonusStacks', value: 5 });
    expect(folded[3]).toEqual({ op: 'biomass', value: 150 });
  });

  it('skips no-op effects when describing (×1, +0)', () => {
    expect(describeEffects([
      { op: 'mul', field: 'towerDamageMult', value: 1 },
      { op: 'add', field: 'fractureBonusStacks', value: 0 },
    ])).toHaveLength(0);
  });
});
