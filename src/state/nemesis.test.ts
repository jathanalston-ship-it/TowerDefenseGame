// Nemesis + trophies (docs/NEMESIS.md): the GRUDGE LADDER escalates the hunt deterministically
// (tiers layer real traits, not just HP), revenge pays a tier-scaled bounty + a permanent
// Vengeance organ + clears the hunt, the sim buffs the marked spawn from ctor opts, and the
// Trophy Rack mounts up to trophySlots organs (chassis/mega tradeoffs + pure-upside vengeance).

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import type { RunResult } from './meta';
import { defaultLifetimeStats, defaultSave, parseImport } from '../save/saveStore';
import { HERO_ORDER, TOWER_ORDER, BOSS } from '../core/config';
import { BOSS_DEFS, bossDef } from '../core/boss';
import { gameEvents } from '../core/events';
import { Game } from '../core/game';
import { TROPHY_DEFS, chassisTrophyCoverage, trophySlots, vengeanceTrophyFor, TROPHY_SLOT_THRESHOLDS } from '../core/trophies';
import { GRUDGE_LADDER, NEMESIS, deepenNemesis, grudgeTierOf, nemesisTraits, vengeanceCores } from '../core/nemesis';
import type { MetaModifiers, RunStats } from '../core/types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

function lossTo(defId: string): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  const stats: RunStats = {
    kills: 5, wave: 4, won: false, biomassEarned: 0, damageDealt: 100, integrityLost: 100,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [], heroId: HERO_ORDER[0], bossesAtDefeat: [defId],
  };
  return { wave: 4, kills: 5, won: false, mastery, heroMastery, stats };
}

describe('grudge ladder (pure)', () => {
  it('tiers deepen with slain, layering ADDITIVE traits — not just HP', () => {
    expect(grudgeTierOf(0)).toBe(0);
    expect(grudgeTierOf(2)).toBe(0); // Marked
    expect(grudgeTierOf(3)).toBe(1); // Hunted
    expect(grudgeTierOf(5)).toBe(2); // Reviled
    expect(grudgeTierOf(8)).toBe(3); // Apex Predator
    const t1 = nemesisTraits(1);
    const t8 = nemesisTraits(8);
    expect(t1.tierName).toBe('Marked');
    expect(t8.tierName).toBe('Apex Predator');
    // Everything escalates monotonically up the ladder.
    expect(t8.hpMult).toBeGreaterThan(t1.hpMult);
    expect(t8.armorBonus).toBeGreaterThan(t1.armorBonus);
    expect(t8.damageMult).toBeGreaterThan(t1.damageMult);
    expect(t8.attackSpeedMult).toBeGreaterThanOrEqual(t1.attackSpeedMult);
    expect(t8.traits.length).toBe(GRUDGE_LADDER.length); // every rung's line is present at the top
    // Tier 1 (Marked) carries no combat traits beyond the hp/bounty curve.
    expect(t1.armorBonus).toBe(0);
    expect(t1.damageMult).toBe(1);
  });

  it('hp/bounty honor their caps and the slain cap', () => {
    const capped = nemesisTraits(999);
    expect(capped.slain).toBe(NEMESIS.slainCap);
    expect(capped.hpMult).toBeCloseTo(NEMESIS.hpCap, 5);
    expect(capped.bountyMult).toBeCloseTo(NEMESIS.bountyCap, 5);
  });

  it('deepenNemesis seeds at 1, repeats climb (capped), a new killer resets', () => {
    expect(deepenNemesis(null, 'progenitor')).toEqual({ defId: 'progenitor', slain: 1 });
    expect(deepenNemesis({ defId: 'progenitor', slain: 4 }, 'progenitor')).toEqual({ defId: 'progenitor', slain: 5 });
    expect(deepenNemesis({ defId: 'progenitor', slain: 3 }, 'brood_cyst')).toEqual({ defId: 'brood_cyst', slain: 1 });
    expect(deepenNemesis({ defId: 'x', slain: NEMESIS.slainCap }, 'x').slain).toBe(NEMESIS.slainCap);
  });

  it('vengeance cores scale with the grudge tier (blood-price + tier bonus)', () => {
    expect(vengeanceCores(2)).toBe(NEMESIS.revengeCoresPerSlain * 2); // tier 0 ⇒ no bonus
    expect(vengeanceCores(5)).toBe(NEMESIS.revengeCoresPerSlain * 5 + NEMESIS.revengeCoresTierBonus * 2);
    expect(vengeanceCores(8)).toBeGreaterThan(vengeanceCores(5));
  });
});

describe('nemesis lifecycle', () => {
  it('a loss to a standing boss seeds the nemesis; a repeat deepens it', () => {
    meta.reset();
    meta.finishRun(lossTo('progenitor'));
    expect(meta.get().nemesis).toEqual({ defId: 'progenitor', slain: 1 });
    meta.finishRun(lossTo('progenitor'));
    expect(meta.get().nemesis).toEqual({ defId: 'progenitor', slain: 2 });
    meta.finishRun(lossTo('brood_cyst'));
    expect(meta.get().nemesis?.slain).toBe(1); // a NEW hunter resets the count
  });

  it('nemesisView surfaces the grudge tier + traits + tier-scaled bounty for the UI', () => {
    meta.reset();
    expect(meta.nemesisView()).toBeNull();
    meta.finishRun(lossTo('progenitor'));
    const v = meta.nemesisView()!;
    expect(v.defId).toBe('progenitor');
    expect(v.tierName).toBe('Marked');
    expect(v.traits.length).toBeGreaterThan(0);
    expect(v.rewardCores).toBe(vengeanceCores(1));
  });

  it('revenge pays scaled cores + an Abyssal phenotype + a Vengeance organ, then ends the hunt', () => {
    meta.reset();
    meta.finishRun(lossTo('progenitor'));
    meta.finishRun(lossTo('progenitor'));
    const before = meta.get();
    expect(before.nemesis?.slain).toBe(2);
    const chassis = bossDef('progenitor')!.chassis;
    // A piece that is NOT the last (a splitter's earlier body) settles nothing yet.
    gameEvents.emit('bossKilled', { defId: 'progenitor', name: 'The Progenitor', x: 360, y: 200, final: false });
    expect(meta.get().nemesis?.slain).toBe(2);
    expect(meta.get().shards).toBe(before.shards);
    gameEvents.emit('bossKilled', { defId: 'progenitor', name: 'The Progenitor', x: 360, y: 200, final: true });
    const after = meta.get();
    expect(after.nemesis).toBeNull();
    expect(after.shards - before.shards).toBe(vengeanceCores(2)); // 60 × slain(2) + tier bonus(0)
    expect(after.cosmetics.owned.some((id) => id.includes('_abyss_'))).toBe(true);
    // the chassis is now AVENGED and its vengeance organ is owned
    expect(after.vengeance).toContain(chassis);
    const venge = vengeanceTrophyFor(chassis)!;
    expect(meta.trophies().find((t) => t.def.id === venge.id)?.owned).toBe(true);
  });

  it('the sim spawns the marked boss buffed with FULL traits — deterministically from ctor opts', () => {
    const def = bossDef('progenitor')!;
    const base = new Game(7, NO_META);
    base.spawnBoss(def);
    const baseBoss = base.enemies.find((e) => e.boss)!;
    const hunted = new Game(7, NO_META, undefined, undefined, undefined, { nemesis: { defId: 'progenitor', slain: 3 } });
    hunted.spawnBoss(def);
    const huntedBoss = hunted.enemies.find((e) => e.boss)!;
    const tb = nemesisTraits(3); // Hunted: +hp, +8 armor, ×1.15 damage
    expect(huntedBoss.maxHp).toBeCloseTo(BOSS.baseHp * def.hpMult * tb.hpMult, 5);
    expect(huntedBoss.maxHp).toBeGreaterThan(baseBoss.maxHp);
    expect(huntedBoss.bounty).toBe(Math.round(def.bounty * tb.bountyMult));
    expect(huntedBoss.baseArmor - baseBoss.baseArmor).toBe(tb.armorBonus);
    expect(huntedBoss.damage / baseBoss.damage).toBeCloseTo(tb.damageMult, 5);
    expect(huntedBoss.boss?.nemesis).toBe(true);
    expect(huntedBoss.boss?.nemesisTier).toBe(tb.tier);
    expect(baseBoss.boss?.nemesis).toBeUndefined();
    // A DIFFERENT boss under the same account spawns untouched.
    const other = new Game(7, NO_META, undefined, undefined, undefined, { nemesis: { defId: 'progenitor', slain: 3 } });
    other.spawnBoss(bossDef('brood_cyst')!);
    const otherBoss = other.enemies.find((e) => e.boss)!;
    expect(otherBoss.boss?.nemesis).toBeUndefined();
    expect(otherBoss.baseArmor).toBe(baseBoss.baseArmor);
  });
});

describe('trophy rack', () => {
  it('covers every chassis (tradeoff + vengeance) + every mega, with correct up/down signs', () => {
    expect(chassisTrophyCoverage()).toBe(true);
    for (const t of TROPHY_DEFS) {
      expect(t.effects.length, t.id).toBeGreaterThanOrEqual(1);
      const muls = t.effects.filter((e) => e.op === 'mul').map((e) => e.value as number);
      const hasUpside = muls.some((v) => v > 1) || t.effects.some((e) => e.op === 'add' && (e.value as number) > 0);
      expect(hasUpside, `${t.id} upside`).toBe(true);
      if (t.source.kind === 'vengeance') {
        // vengeance organs are PURE upside — no downside, no down-line
        expect(muls.every((v) => v >= 1), `${t.id} pure upside`).toBe(true);
        expect(t.down).toBe('');
      } else {
        // tradeoff organs must carry a real downside
        const hasDownside = muls.some((v) => v < 1) || t.effects.some((e) => e.op === 'add' && (e.value as number) < 0);
        expect(hasDownside, `${t.id} downside`).toBe(true);
      }
    }
  });

  it('slots grow with organs owned (data-driven thresholds)', () => {
    expect(trophySlots(0)).toBe(1);
    expect(trophySlots(TROPHY_SLOT_THRESHOLDS[1])).toBe(2);
    expect(trophySlots(TROPHY_SLOT_THRESHOLDS[2])).toBe(3);
    expect(trophySlots(999)).toBe(TROPHY_SLOT_THRESHOLDS.length);
  });

  it('ownership derives from ledgers; the rack mounts up to its slots and folds every mounted pair', () => {
    meta.reset();
    expect(meta.trophies().every((t) => !t.owned)).toBe(true);
    expect(meta.equipTrophy('tr_bruiser', true)).toBe(false); // unowned refuses
    // Slay one boss of EACH chassis so all five chassis trophies unlock (owned ⇒ rack grows).
    const perChassis = new Map<string, string>();
    for (const [id, def] of Object.entries(BOSS_DEFS)) if (!perChassis.has(def.chassis)) perChassis.set(def.chassis, id);
    for (const id of perChassis.values()) gameEvents.emit('bossKilled', { defId: id, name: id, x: 0, y: 0, final: true });
    const owned = meta.trophies().filter((t) => t.owned).map((t) => t.def.id);
    expect(owned.length).toBeGreaterThan(0);
    const rack0 = meta.trophyRack();
    expect(rack0.slots).toBeGreaterThanOrEqual(1);
    // Mount up to the cap.
    let mounted = 0;
    for (const id of owned) {
      if (mounted >= rack0.slots) {
        expect(meta.equipTrophy(id, true)).toBe(false); // rack full — refused
      } else if (meta.equipTrophy(id, true)) {
        mounted++;
      }
    }
    expect(meta.trophyRack().used).toBe(rack0.slots);
    // The fold contains every mounted organ's effects (≥ one pair per mounted slot).
    expect(meta.trophyRunEffects().length).toBeGreaterThanOrEqual(mounted);
    // Unmount one → a slot frees and the fold shrinks.
    const firstMounted = meta.trophies().find((t) => t.equipped)!.def.id;
    expect(meta.equipTrophy(firstMounted, false)).toBe(true);
    expect(meta.trophyRack().used).toBe(rack0.slots - 1);
  });

  it('an empty rack folds NOTHING (golden-safe) — a fresh account', () => {
    meta.reset();
    expect(meta.trophyRunEffects()).toEqual([]);
  });
});

describe('save migration (v33→v34)', () => {
  it('migrates the legacy single equippedTrophy into a one-organ rack + seeds vengeance', () => {
    const old = defaultSave() as unknown as Record<string, unknown>;
    delete old.equippedTrophies;
    delete old.vengeance;
    old.equippedTrophy = 'tr_bruiser'; // legacy shape
    const res = parseImport(JSON.stringify({ schemaVersion: 33, data: old }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.equippedTrophies).toEqual(['tr_bruiser']);
      expect(res.data.vengeance).toEqual([]);
    }
  });
});
