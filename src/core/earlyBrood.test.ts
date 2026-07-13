// The EARLY BROOD (docs/ENEMIES.md §early-brood) — four WEAK enemy variations bred for the
// opening campaign: Hollow Husk (the armor read), Itch Flea (speed pressure), Creeping Mold
// (the soft wall) and Pale Skulker (the coverage prober). Pins:
//   • the WEAK-BAND contract: trait-less walkers whose derived campaign gate admits them at
//     STAGE 1 (tier-1 effective HP; wave-1 legal speed/damage);
//   • "a chance to spawn on stage 1–2": the real generator's pool contains them from stage 1,
//     and across seeds the composer actually FIELDS each of them in stage-1/2 plans;
//   • golden control: the scripted WAVES table (the pinned autoplay) never spawns them.

import { describe, it, expect } from 'vitest';
import { ENEMY_DEFS, WAVES } from './config';
import { composeStagePlan, effectiveHp, generateStage } from './campaign';
import { BIOMES } from './biomes';
import { resolveDifficulty } from './difficulty';
import { Rng } from './rng';
import type { EnemyKind } from './types';

const BROOD: EnemyKind[] = ['husk', 'flea', 'mold', 'skulker'];

describe('the early brood — weak-band contract', () => {
  it.each(BROOD)('%s is a trait-less, tier-1 walker (wave-1 legal)', (kind) => {
    const d = ENEMY_DEFS[kind];
    // No mechanics gates: every role trait absent ⇒ the derived unlockStage mech term stays 1.
    expect(d.shieldHp).toBeUndefined();
    expect(d.regenPerSec).toBeUndefined();
    expect(d.summon).toBeUndefined();
    expect(d.auraRadius).toBeUndefined();
    expect(d.explodeDamage).toBeUndefined();
    expect(d.siege).toBeUndefined();
    expect(d.behavior.flying).toBeUndefined();
    expect(d.behavior.burrowing).toBeUndefined();
    // Tier-1 effective HP (baseHp 20 + hpPerTier 72 ⇒ < 92 keeps the hp gate at stage 1).
    expect(effectiveHp(d)).toBeLessThan(92);
    // Wave-1 unit gates: small bite, walker pace (wave 1 excludes speed > 100).
    expect(d.damage).toBeLessThanOrEqual(8);
    expect(d.speed).toBeLessThanOrEqual(100);
  });

  it('each teaches a DISTINCT lesson (the stat that carries it)', () => {
    expect(ENEMY_DEFS.husk.armor).toBeGreaterThan(0); // the first armor read
    expect(ENEMY_DEFS.flea.speed).toBeGreaterThan(90); // speed pressure under the Sprinter
    expect(ENEMY_DEFS.mold.hp).toBeGreaterThan(ENEMY_DEFS.runner.hp); // the soft wall outweighs the chaff
    expect(ENEMY_DEFS.mold.speed).toBeLessThan(ENEMY_DEFS.larva.speed); // …and creeps slower than anything
    // The skulker hunts gaps — the highest tower-avoidance in the weak band.
    for (const k of ['runner', 'mite', 'larva', 'husk', 'flea', 'mold'] as EnemyKind[]) {
      expect(ENEMY_DEFS.skulker.behavior.avoidTowers).toBeGreaterThan(ENEMY_DEFS[k].behavior.avoidTowers);
    }
  });
});

describe('the early brood — campaign presence (stage 1–2 and up)', () => {
  it('the real stage-1 and stage-2 pools contain all four', () => {
    for (const stage of [1, 2]) {
      const pool = generateStage(stage).enemyPool;
      for (const k of BROOD) expect(pool, `stage ${stage} pool missing ${k}`).toContain(k);
    }
  });

  it('the composer actually FIELDS each of them in early plans (a real chance, not a technicality)', () => {
    // composeStagePlan is the exact machinery generateStage runs; sweep seeds the way the daily
    // does to measure spawn odds. Each brood kind must appear in a healthy share of stage-1/2 plans.
    const base = resolveDifficulty('standard');
    const seen: Record<string, number> = { husk: 0, flea: 0, mold: 0, skulker: 0 };
    const plans = 60;
    for (let s = 0; s < plans; s++) {
      const rng = new Rng(1000 + s);
      const st = 1 + (s % 2); // alternate stages 1 and 2
      const plan = composeStagePlan(rng, st, BIOMES[s % BIOMES.length], base, 6);
      const kinds = new Set(plan.waves.flat().map((g) => g.kind));
      for (const k of BROOD) if (kinds.has(k)) seen[k]++;
    }
    for (const k of BROOD) {
      expect(seen[k], `${k} appeared in ${seen[k]}/${plans} early plans`).toBeGreaterThanOrEqual(5);
    }
  });

  it('golden control: the scripted WAVES table never spawns the brood (pinned autoplay untouched)', () => {
    const scripted = new Set(WAVES.flat().map((g) => g.kind));
    for (const k of BROOD) expect(scripted.has(k)).toBe(false);
  });
});
