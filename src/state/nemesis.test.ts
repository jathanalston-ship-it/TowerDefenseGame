// Nemesis + trophies (docs/NEMESIS.md): losses seed/deepen the hunt, revenge pays and
// clears it, the sim buffs the marked spawn deterministically, and the trophy rack
// derives ownership + folds exactly one tradeoff pair.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import type { RunResult } from './meta';
import { defaultLifetimeStats } from '../save/saveStore';
import { HERO_ORDER, TOWER_ORDER, BOSS } from '../core/config';
import { bossDef } from '../core/boss';
import { gameEvents } from '../core/events';
import { Game } from '../core/game';
import { TROPHY_DEFS, chassisTrophyCoverage } from '../core/trophies';
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

  it('revenge pays blood-price cores + an Abyssal phenotype and ends the hunt', () => {
    meta.reset();
    meta.finishRun(lossTo('progenitor'));
    meta.finishRun(lossTo('progenitor'));
    const before = meta.get();
    expect(before.nemesis?.slain).toBe(2);
    gameEvents.emit('bossKilled', { defId: 'progenitor', name: 'The Progenitor', x: 360, y: 200 });
    const after = meta.get();
    expect(after.nemesis).toBeNull();
    expect(after.shards - before.shards).toBe(120); // 60 × slain(2)
    expect(after.cosmetics.owned.some((id) => id.includes('_abyss_'))).toBe(true);
  });

  it('the sim spawns the marked boss buffed — deterministically from ctor opts', () => {
    const def = bossDef('progenitor')!;
    const base = new Game(7, NO_META);
    base.spawnBoss(def);
    const baseBoss = base.enemies.find((e) => e.boss)!;
    const hunted = new Game(7, NO_META, undefined, undefined, undefined, { nemesis: { defId: 'progenitor', slain: 3 } });
    hunted.spawnBoss(def);
    const huntedBoss = hunted.enemies.find((e) => e.boss)!;
    expect(huntedBoss.maxHp).toBeCloseTo(BOSS.baseHp * def.hpMult * 1.45, 5); // ×(1 + 0.15×3)
    expect(huntedBoss.maxHp).toBeGreaterThan(baseBoss.maxHp);
    expect(huntedBoss.bounty).toBe(Math.round(def.bounty * 1.3));
    expect(huntedBoss.boss?.nemesis).toBe(true);
    expect(baseBoss.boss?.nemesis).toBeUndefined();
    // A DIFFERENT boss under the same account spawns untouched.
    const other = new Game(7, NO_META, undefined, undefined, undefined, { nemesis: { defId: 'progenitor', slain: 3 } });
    other.spawnBoss(bossDef('brood_cyst')!);
    const otherBoss = other.enemies.find((e) => e.boss)!;
    expect(otherBoss.boss?.nemesis).toBeUndefined();
  });
});

describe('trophy rack', () => {
  it('covers every chassis + every mega, with a REAL tradeoff on every organ', () => {
    expect(chassisTrophyCoverage()).toBe(true);
    for (const t of TROPHY_DEFS) {
      expect(t.effects.length, t.id).toBeGreaterThanOrEqual(2);
      const muls = t.effects.filter((e) => e.op === 'mul').map((e) => e.value as number);
      expect(muls.some((v) => v > 1) || t.effects.some((e) => e.op === 'add' && (e.value as number) > 0), `${t.id} upside`).toBe(true);
      expect(muls.some((v) => v < 1) || t.effects.some((e) => e.op === 'add' && (e.value as number) < 0), `${t.id} downside`).toBe(true);
    }
  });

  it('ownership derives from kill ledgers; equip folds exactly the mounted pair', () => {
    meta.reset();
    expect(meta.trophies().every((t) => !t.owned)).toBe(true);
    expect(meta.equipTrophy('tr_bruiser')).toBe(false); // unowned refuses
    gameEvents.emit('bossKilled', { defId: 'progenitor', name: 'The Progenitor', x: 360, y: 200 }); // progenitor's chassis lands in bossesSlain
    const owned = meta.trophies().filter((t) => t.owned);
    expect(owned.length).toBeGreaterThan(0);
    const target = owned[0].def;
    expect(meta.equipTrophy(target.id)).toBe(true);
    expect(meta.trophyRunEffects()).toEqual(target.effects);
    expect(meta.equipTrophy(null)).toBe(true);
    expect(meta.trophyRunEffects()).toEqual([]);
  });
});
