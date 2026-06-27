// Boss framework guards — structural contracts (every launch boss carries the five
// required traits) plus live-sim checks (phases advance, abilities fire, weakness +
// modifiers apply, and a boss run stays deterministic + finite). Balance is not
// asserted here; these protect the framework's promises as the roster grows.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import {
  SIM_DT, defaultMetaModifiers, ENEMY_DEFS,
  BOSS_KINDS, BOSS_ENEMY_DEFS, BOSS_MODIFIERS, applyBossModifiers, bossForBiome, flagshipBoss,
  bossDamageMult, initBossRuntime,
} from './config';
import type { BossProfile, BossRuntime } from './config';
import { THREAT_COST } from './wavecomposer';
import { BIOME_IDS } from './biomes';
import { towerSlots } from './map';

const NO_META = defaultMetaModifiers();

/** Drive a fresh wave so the bossSystem ticks, with the boss spawned in. */
function bossInWave(seed: number, kind: keyof typeof BOSS_ENEMY_DEFS) {
  const g = new Game(seed, NO_META);
  g.startWave(); // enter the 'wave' phase (bossSystem only runs there)
  g.debugSpawn(kind);
  return { g, boss: g.enemies.find((e) => e.boss)! };
}

describe('boss roster (the five required traits)', () => {
  it('ships exactly the 12 launch bosses, each flagged + profiled', () => {
    const flagged = Object.values(ENEMY_DEFS).filter((e) => e.isBoss);
    expect(flagged.length).toBe(12);
    expect([...flagged].map((e) => e.kind).sort()).toEqual([...BOSS_KINDS].sort());
    for (const k of BOSS_KINDS) expect(ENEMY_DEFS[k]).toBe(BOSS_ENEMY_DEFS[k]); // spread, same object
  });

  it('every boss has multiple phases, signature abilities, and a weakness', () => {
    for (const k of BOSS_KINDS) {
      const p = ENEMY_DEFS[k].boss!;
      expect(p.phases.length).toBeGreaterThanOrEqual(2); // multiple phases
      expect(p.phases[0].at).toBe(1); // first phase from full HP
      // phase thresholds strictly descend (each crossed exactly once, forward-only)
      for (let i = 1; i < p.phases.length; i++) expect(p.phases[i].at).toBeLessThan(p.phases[i - 1].at);
      expect(p.phases.some((ph) => ph.abilities.length > 0)).toBe(true); // signature abilities
      const hasWeakness = Object.keys(p.weakness).length > 0 || p.phases.some((ph) => ph.weakness);
      expect(hasWeakness).toBe(true); // distinct weaknesses (base or per-phase/adaptive)
    }
  });

  it('gives every boss arena influence (summon / hazard / suppress)', () => {
    const ARENA = new Set(['summon', 'hazard', 'suppress']);
    for (const k of BOSS_KINDS) {
      const p = ENEMY_DEFS[k].boss!;
      const influences = p.phases.some((ph) => ph.abilities.some((a) => ARENA.has(a.kind)) || ph.onEnterSummon);
      expect(influences).toBe(true);
    }
  });

  it('gives every boss a unique silhouette descriptor', () => {
    const sigs = BOSS_KINDS.map((k) => {
      const s = ENEMY_DEFS[k].boss!.silhouette;
      return `${s.form}|${s.spikes}|${s.eyes}|${s.accent}`;
    });
    expect(new Set(sigs).size).toBe(BOSS_KINDS.length); // all distinct
  });

  it('never budget-rolls a boss (THREAT_COST omits every boss kind)', () => {
    for (const k of BOSS_KINDS) expect(THREAT_COST[k]).toBeUndefined();
  });
});

describe('weakness / resistance (test the build, not the DPS)', () => {
  const prof = ENEMY_DEFS.aegis.boss!; // weak Kinetic 1.5, resist Vital 0.75
  const rt = (): BossRuntime => { const r = initBossRuntime(); r.phase = 0; return r; };

  it('amplifies the weak class and dampens the resistant one', () => {
    expect(bossDamageMult(prof, rt(), 'Kinetic')).toBeGreaterThan(1);
    expect(bossDamageMult(prof, rt(), 'Vital')).toBeLessThan(1);
    expect(bossDamageMult(prof, rt(), undefined)).toBe(1); // classless ignores bias
  });

  it('the Apex Rival rotates its resistance by phase (mono-damage check)', () => {
    const apex = ENEMY_DEFS.apex_rival.boss!;
    const at = (phase: number, c: 'Kinetic' | 'Caustic' | 'Vital') => {
      const r = initBossRuntime(); r.phase = phase; return bossDamageMult(apex, r, c);
    };
    expect(at(0, 'Kinetic')).toBeLessThan(1); // phase 1 resists Kinetic
    expect(at(1, 'Caustic')).toBeLessThan(1); // phase 2 resists Caustic
    expect(at(2, 'Vital')).toBeLessThan(1); // phase 3 resists Vital
    expect(at(0, 'Caustic')).toBeGreaterThan(1); // …while the others stay vulnerable
  });

  it('a cloak window makes the boss untargetable (sim hp unchanged)', () => {
    const { g, boss } = bossInWave(7, 'phantom'); // phantom cloaks
    boss.boss!.invulnUntil = g['time'] + 5; // force a cloak window
    const hp = boss.hp;
    g.debugDamageMult = 1000; // would otherwise delete it
    for (let i = 0; i < 30; i++) g.advance(SIM_DT);
    expect(boss.hp).toBe(hp); // shrugged off all damage while cloaked
  });
});

describe('procedural modifiers (future-enhancement seam)', () => {
  it('folds stat scales, bonus abilities, and the adaptive flag; ignores unknowns', () => {
    const e = applyBossModifiers(['colossal', 'unstable', 'adaptive', 'not-a-real-mod']);
    expect(e.hpMult).toBeGreaterThan(1);
    expect(e.bonus.length).toBeGreaterThan(0); // 'unstable' added an ability
    expect(e.adaptive).toBe(true);
    expect(e.labels).toContain('Colossal');
    expect(e.labels).not.toContain('not-a-real-mod');
    expect(applyBossModifiers(undefined).hpMult).toBe(1); // identity when absent
  });

  it('scales boss HP at spawn through the mutator pipeline', () => {
    const base = bossInWave(3, 'tyrant').boss.maxHp;
    // Spawn the same boss with a 'colossal' modifier via a real wave injection.
    const g = new Game(3, NO_META, { mode: 'classic' });
    g['spawnQueue'] = [{ kind: 'tyrant', at: 0, hpMult: 1, bountyMult: 1, elite: false, mutators: ['colossal'] }];
    g['phase'] = 'wave';
    g['spawnSystem']();
    const colossal = g.enemies.find((e) => e.boss)!;
    expect(colossal.maxHp).toBeGreaterThan(base); // +HP from the modifier
  });

  it('exposes a non-empty modifier table', () => {
    expect(BOSS_MODIFIERS.length).toBeGreaterThanOrEqual(4);
    for (const m of BOSS_MODIFIERS) expect(m.name.length).toBeGreaterThan(0);
  });
});

describe('boss selection (Stage Mode + Endless)', () => {
  it('maps every biome to valid bosses at both depths; deep ⇒ the flagship', () => {
    for (const b of BIOME_IDS) {
      const shallow = bossForBiome(b, 2);
      const deep = bossForBiome(b, 7);
      expect(BOSS_KINDS).toContain(shallow);
      expect(BOSS_KINDS).toContain(deep);
      expect(deep).toBe(flagshipBoss(b)); // deep stages field the flagship
    }
  });

  it('is deterministic for a fixed (biome, depth)', () => {
    expect(bossForBiome('machine', 3)).toBe(bossForBiome('machine', 3));
  });
});

describe('boss simulation (phases + abilities, live)', () => {
  it('initializes its profile and runs phase-0 enter effects on spawn', () => {
    const { g, boss } = bossInWave(1, 'forgemind'); // phase 0 grants a 240 shield
    for (let i = 0; i < 6; i++) g.advance(SIM_DT);
    expect(boss.boss!.phase).toBe(0);
    expect(boss.shield).toBeGreaterThan(0); // enterBossPhase(0) applied the shield
  });

  it('advances phases as HP falls (forward-only)', () => {
    const { g, boss } = bossInWave(1, 'progenitor'); // phases at 1 / 0.6 / 0.25
    g.advance(SIM_DT);
    expect(boss.boss!.phase).toBe(0);
    boss.hp = boss.maxHp * 0.2; // drop below the deepest threshold
    g.advance(SIM_DT);
    expect(boss.boss!.phase).toBeGreaterThanOrEqual(2);
  });

  it('summons adds (capped) — board pressure the player must clear', () => {
    const { g, boss } = bossInWave(2, 'progenitor'); // summons from ~3s in
    for (let i = 0; i < 360; i++) g.advance(SIM_DT); // ~6s
    expect(boss.boss!.adds).toBeGreaterThan(0);
    expect(boss.boss!.adds).toBeLessThanOrEqual(18); // BOSS.addCap respected
  });

  it('a boss EMP suppresses a nearby tower', () => {
    const g = new Game(4, NO_META);
    g.debugAddBiomass(1000);
    g.startWave();
    const slot = towerSlots[0];
    expect(g.placeTower('needle', slot.x, slot.y)).toBe(true);
    const tower = g.towers[0];
    g.debugSpawn('breacher_prime'); // EMPs towers within range
    const boss = g.enemies.find((e) => e.boss)!;
    boss.x = tower.x; boss.y = tower.y; // sit on the tower so the EMP lands
    boss.boss!.baseSpeed = 0; // pin it there (phase-enter rebinds speed from baseSpeed)
    for (let i = 0; i < 300; i++) g.advance(SIM_DT); // ~5s — past the first suppress cast
    expect(tower.suppressedUntil).toBeGreaterThan(0);
  });

  it('a full boss spawn stays finite + deterministic (no NaN/hang)', () => {
    const drive = (seed: number) => {
      const { g, boss } = bossInWave(seed, 'dreaming_god');
      for (let i = 0; i < 600; i++) g.advance(SIM_DT);
      return { phase: boss.boss!.phase, adds: boss.boss!.adds, enemies: g.enemies.length, hp: Math.round(boss.hp) };
    };
    const a = drive(11);
    expect(Number.isFinite(a.hp)).toBe(true);
    expect(drive(11)).toEqual(a); // identical seed ⇒ identical outcome
  });
});
