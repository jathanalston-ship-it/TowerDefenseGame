// Gene Card TRANSCENDENCE (docs/GENE-EVOLUTION.md §Transcendence) — the data layer, the fold, the
// cost curve, Power visibility, and the save sanitizer. The meta spend path (transcendGene) is
// covered beside the other guarded gene spends in src/state/geneArchive.test.ts.

import { describe, it, expect } from 'vitest';
import {
  TRANSCEND_BY_CATEGORY, transcendOption, transcendOptionsFor, transcendPowerMult,
} from './geneTranscend';
import type { TranscendOption } from './geneTranscend';
import { CARD_CATEGORY_LABEL, cardProblems, cardRegistry } from './cards';
import type { CardDef } from './cards';
import { effectiveGeneEffects, geneCollectionPowerMult, geneMaxLevel, sanitizeGeneSave } from './geneCards';
import { ESSENCE_COST, essenceTranscendCost } from './geneEssence';
import { effectsPower } from './power';
import { Game } from './game';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const needles = cardRegistry.get('sharpened_needles')!; // common · tower — options resolve via the family

describe('family pools — every archetype is covered, so ALL cards resolve options', () => {
  it('every CardCategory union member authors a pool of ≥2 uniquely-labeled options', () => {
    // CARD_CATEGORY_LABEL's keys ARE the union — iterating it means a new category cannot ship
    // without a pool (this test breaks the moment one is added unauthored).
    for (const cat of Object.keys(CARD_CATEGORY_LABEL) as (keyof typeof TRANSCEND_BY_CATEGORY)[]) {
      const pool = TRANSCEND_BY_CATEGORY[cat];
      expect(pool, `category '${cat}' has no transcend pool`).toBeDefined();
      expect(pool.length, `category '${cat}' offers no real choice`).toBeGreaterThanOrEqual(2);
      for (const o of pool) {
        expect(o.label.trim().length).toBeGreaterThan(0);
        expect(o.effects.length).toBeGreaterThan(0);
      }
    }
  });

  it('option ids are globally unique (a saved id can never resolve ambiguously)', () => {
    const ids = Object.values(TRANSCEND_BY_CATEGORY).flat().map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('EVERY registered card resolves ≥2 options with zero per-card code', () => {
    for (const def of cardRegistry.active()) {
      expect(transcendOptionsFor(def).length, `card '${def.id}' resolves no options`).toBeGreaterThanOrEqual(2);
    }
  });

  it('a per-card override REPLACES the family pool wholesale', () => {
    const override: TranscendOption[] = [
      { id: 'x_a', label: 'A', effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }] },
      { id: 'x_b', label: 'B', effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.05 }] },
    ];
    const def: CardDef = { ...needles, transcendOptions: override };
    expect(transcendOptionsFor(def)).toBe(override);
    expect(transcendOption(def, 't_overwhelm')).toBeNull(); // family ids no longer resolve
    expect(transcendOption(def, 'x_a')?.label).toBe('A');
  });

  it('transcendOption resolves a saved id and nulls stale/absent ones', () => {
    const pool = transcendOptionsFor(needles);
    expect(transcendOption(needles, pool[0].id)).toBe(pool[0]);
    expect(transcendOption(needles, undefined)).toBeNull();
    expect(transcendOption(needles, '__stale__')).toBeNull();
  });
});

describe('Power visibility + mid-run liveness — permanent lines must count and must WORK', () => {
  it('every authored option moves Power (>×1) — no invisible permanent progression', () => {
    for (const [cat, pool] of Object.entries(TRANSCEND_BY_CATEGORY)) {
      for (const o of pool) {
        expect(effectsPower(o.effects), `option '${cat}/${o.id}' is invisible to Power`).toBeGreaterThan(1);
      }
    }
  });

  it('no option uses a boot-only field (the second line folds at the MID-run draft seam too)', () => {
    const bootOnly = new Set(['startBiomassBonus', 'integrityMult', 'heroMaxHpMult']);
    for (const [cat, pool] of Object.entries(TRANSCEND_BY_CATEGORY)) {
      for (const o of pool) {
        for (const e of o.effects) {
          if (e.op === 'mul' || e.op === 'add') {
            expect(bootOnly.has(e.field), `option '${cat}/${o.id}' uses boot-only '${e.field}'`).toBe(false);
          }
        }
      }
    }
  });

  it('transcendPowerMult: ×1 untranscended (golden-safe), the option strength when chosen', () => {
    expect(transcendPowerMult(needles, undefined)).toBe(1);
    expect(transcendPowerMult(needles, '__stale__')).toBe(1);
    const opt = transcendOptionsFor(needles)[0];
    expect(transcendPowerMult(needles, opt.id)).toBe(effectsPower(opt.effects));
  });

  it('geneCollectionPowerMult counts the chosen line in the SAME gene bucket', () => {
    const opt = transcendOptionsFor(needles)[0];
    const base = geneCollectionPowerMult({ [needles.id]: { level: 1 } });
    const trans = geneCollectionPowerMult({ [needles.id]: { level: 1, transcend: opt.id } });
    expect(trans).toBeGreaterThan(base);
  });

  it('the cardProblems contract bites on a bad override (choice/visibility/boot-only)', () => {
    const bad: CardDef = {
      ...needles,
      transcendOptions: [
        { id: 'solo', label: 'Lonely', effects: [{ op: 'mul', field: 'integrityMult', value: 1.1 }] },
      ],
    };
    const problems = cardProblems(bad);
    expect(problems.some((p) => p.includes('≥2 options'))).toBe(true);
    expect(problems.some((p) => p.includes('boot-only'))).toBe(true);
    const good: CardDef = {
      ...needles,
      transcendOptions: [
        { id: 'g_a', label: 'A', effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.06 }] },
        { id: 'g_b', label: 'B', effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.05 }] },
      ],
    };
    expect(cardProblems(good).filter((p) => p.includes('transcend'))).toEqual([]);
  });
});

describe('cost — one geometric knob beside the level curve (the sink)', () => {
  it('costs base × transcendMult per rarity (and re-choosing pays it again by design)', () => {
    for (const [rarity, base] of Object.entries(ESSENCE_COST.baseByCardRarity)) {
      expect(essenceTranscendCost(rarity)).toBe(Math.round(base * ESSENCE_COST.transcendMult));
    }
    expect(essenceTranscendCost('legendary')).toBeGreaterThan(essenceTranscendCost('common'));
    expect(essenceTranscendCost('???')).toBe(essenceTranscendCost('common')); // unknown → common
  });
});

describe('the fold — the chosen line rides effectiveGeneEffects, the EXISTING pipeline', () => {
  it('untranscended resolves the exact base/upgrade effects (byte-identical golden path)', () => {
    expect(effectiveGeneEffects(needles, 0)).toBe(needles.effects); // same array, not a copy
    expect(effectiveGeneEffects(needles, 0, 0, undefined)).toBe(needles.effects);
    expect(effectiveGeneEffects(needles, 0, 0, '__stale__')).toBe(needles.effects); // stale id = no-op
  });

  it('appends the chosen option LAST, and different options fold differently', () => {
    const [a, b] = transcendOptionsFor(needles);
    const withA = effectiveGeneEffects(needles, 0, 0, a.id);
    const withB = effectiveGeneEffects(needles, 0, 0, b.id);
    expect(withA).toEqual([...needles.effects, ...a.effects]);
    expect(withB).toEqual([...needles.effects, ...b.effects]);
    expect(withA).not.toEqual(withB); // option A ≠ option B, deterministically
    // Stacks WITH upgrade levels (level effects first, the second line last).
    const lvl = Math.min(1, geneMaxLevel(needles));
    const leveled = effectiveGeneEffects(needles, lvl, 0, a.id);
    expect(leveled.slice(-a.effects.length)).toEqual(a.effects);
    expect(leveled.length).toBe(effectiveGeneEffects(needles, lvl).length + a.effects.length);
  });

  it('a transcended run boots stronger than base — through the same seam (no new plumbing)', () => {
    // sharpened_needles + Overwhelming Force: ×1.12 base, ×1.08 second line.
    const base = new Game(1, NO_META, undefined, 'ravager', undefined, { startingGenes: [needles.id] }) as unknown as { mods: { towerDamageMult: number } };
    const trans = new Game(1, NO_META, undefined, 'ravager', undefined, {
      startingGenes: [needles.id], geneTranscends: { [needles.id]: 't_overwhelm' },
    }) as unknown as { mods: { towerDamageMult: number } };
    expect(base.mods.towerDamageMult).toBeCloseTo(1.12, 5);
    expect(trans.mods.towerDamageMult).toBeCloseTo(1.12 * 1.08, 5);
    // Omitted geneTranscends ⇒ byte-identical mods (the golden invariant).
    const empty = new Game(1, NO_META, undefined, 'ravager', undefined, { startingGenes: [needles.id], geneTranscends: {} }) as unknown as { mods: Record<string, unknown> };
    expect(empty.mods).toEqual((base as unknown as { mods: Record<string, unknown> }).mods);
  });
});

describe('save sanitizer — transcend survives round-trips, manipulation does not', () => {
  it('keeps a valid id, drops stale/foreign/non-string ones, stays sparse', () => {
    const opt = transcendOptionsFor(needles)[0];
    const clean = sanitizeGeneSave({
      [needles.id]: { level: 1, transcend: opt.id },
      rapid_glands: { level: 0, transcend: '__forged__' }, // stale id ⇒ dropped ⇒ entry evaporates
      __unknown_card__: { level: 2, transcend: opt.id },
    });
    expect(clean[needles.id]).toEqual(expect.objectContaining({ level: 1, transcend: opt.id }));
    expect(clean.rapid_glands).toBeUndefined(); // nothing meaningful left
    expect(clean.__unknown_card__).toBeUndefined();
    expect(sanitizeGeneSave({ [needles.id]: { level: 1, transcend: 42 } })[needles.id].transcend).toBeUndefined();
  });

  it('a transcend-only entry persists (level 0 but chosen line) — the sparse rule keeps it', () => {
    const opt = transcendOptionsFor(needles)[0];
    const clean = sanitizeGeneSave({ [needles.id]: { level: 0, transcend: opt.id } });
    expect(clean[needles.id]).toEqual({ level: 0, transcend: opt.id });
  });
});
