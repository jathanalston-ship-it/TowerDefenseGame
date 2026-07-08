// Team set pooling (docs/EQUIPMENT.md §12) — end-to-end. The per-loadout item fold and the pooled
// count logic are pinned in equipment.test.ts; this proves the SIM wiring: a set assembled ACROSS the
// fielded roster (RunOptions.setEffects) folds BOTH tiers ONCE into the run's modifiers, and a run
// with no set effects is the gear-less baseline (golden-safe — autoplay passes no setEffects).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { teamSetEffects, rollItem, itemDef } from './equipment';
import { Rng } from './rng';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

// Four apex pieces (2 weapon + 2 armor) split across two heroes' loadouts → 4 pooled apex pieces.
function fourPieceApexSetEffects() {
  const r = new Rng(4);
  const rng = () => r.next();
  const w1 = rollItem(rng, itemDef('w_quill')!, 'common');
  const a1 = rollItem(rng, itemDef('a_chitin')!, 'common');
  const w2 = rollItem(rng, itemDef('w_ricochet')!, 'common');
  const a2 = rollItem(rng, itemDef('a_spineback')!, 'common');
  const inv = [w1, a1, w2, a2];
  const loA = { weapon: w1.uid, armor: a1.uid, relic: null };
  const loB = { weapon: w2.uid, armor: a2.uid, relic: null };
  return teamSetEffects(inv, [loA, loB]); // apex 2pc (+1 fracture) AND 4pc (×1.1 tower fire rate)
}

describe('team set pooling — the 4-piece tier comes online across the roster', () => {
  it('a 4-piece set pooled across the fielded roster folds BOTH tiers ONCE into run mods', () => {
    const base = new Game(1, NO_META); // gear-less baseline
    const g = new Game(1, NO_META, undefined, 'ravager', undefined, {
      heroRoster: ['ravager', 'shepherd'],
      setEffects: fourPieceApexSetEffects(),
    });
    // apex 2pc: +1 fracture stack (additive) · apex 4pc: ×1.1 tower fire rate (multiplicative) — both applied.
    expect(g.mods.fractureBonusStacks).toBe(base.mods.fractureBonusStacks + 1);
    expect(g.mods.towerFireRateMult).toBeCloseTo(base.mods.towerFireRateMult * 1.1, 6);
  });

  it('the 4-piece bonus folds exactly ONCE (not per hero) even with a full 3-hero roster', () => {
    const base = new Game(1, NO_META);
    const g = new Game(1, NO_META, undefined, 'ravager', undefined, {
      heroRoster: ['ravager', 'shepherd', 'overseer'],
      setEffects: fourPieceApexSetEffects(),
    });
    // ×1.1 once — NOT ×1.1^3. (Team bonuses fold at the team level, so more heroes never re-apply them.)
    expect(g.mods.towerFireRateMult).toBeCloseTo(base.mods.towerFireRateMult * 1.1, 6);
  });

  it('a HERO-SCOPED set field (Killing Instinct 2pc → +heroCritChance) reaches the shared mods → every fielded hero', () => {
    const r = new Rng(9);
    const rng = () => r.next();
    const w = rollItem(rng, itemDef('w_drill')!, 'common');    // precision weapon
    const a = rollItem(rng, itemDef('a_predator')!, 'common'); // precision armor
    const setEffects = teamSetEffects([w, a], [{ weapon: w.uid, armor: a.uid, relic: null }]); // 2pc → +0.08 crit
    const base = new Game(1, NO_META);
    const g = new Game(1, NO_META, undefined, 'ravager', undefined, { heroRoster: ['ravager', 'shepherd'], setEffects });
    // heroCritChance is HERO-SCOPED; folding the team set into the shared mods propagates it to every
    // fielded hero's bundle (hmods clones this.mods) — the whole team benefits from the assembled set.
    expect(g.mods.heroCritChance).toBeCloseTo(base.mods.heroCritChance + 0.08, 6);
  });

  it('no setEffects ⇒ run mods are the gear-less baseline (golden-safe status quo)', () => {
    const base = new Game(1, NO_META);
    const g = new Game(1, NO_META, undefined, 'ravager', undefined, { heroRoster: ['ravager', 'shepherd'] });
    expect(g.mods.towerFireRateMult).toBe(base.mods.towerFireRateMult);
    expect(g.mods.fractureBonusStacks).toBe(base.mods.fractureBonusStacks);
  });
});
