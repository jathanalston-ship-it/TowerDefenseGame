import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { ENEMY_DEFS, SIM_DT, enemyProblems, enemyRegistry } from './config';
import { towerSlots } from './map';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('enemy roster (~30, role-trait driven)', () => {
  it('registers ~30 archetypes, all of them valid', () => {
    expect(enemyRegistry.size).toBeGreaterThanOrEqual(28);
    for (const d of enemyRegistry.all()) expect(enemyProblems(d)).toEqual([]);
  });

  it('covers every role with a real mechanical trait (not a stat slide)', () => {
    expect(ENEMY_DEFS.bulwark.shieldHp).toBeGreaterThan(0); // Shielded
    expect(ENEMY_DEFS.warden.shieldHp).toBeGreaterThan(0);
    expect(ENEMY_DEFS.knitter.regenPerSec).toBeGreaterThan(0); // Regenerating
    expect(ENEMY_DEFS.revenant.regenPerSec).toBeGreaterThan(0);
    expect(ENEMY_DEFS.broodmother.summon?.kind).toBe('mite'); // Summoner
    expect(ENEMY_DEFS.hivecaller.summon?.kind).toBe('larva');
    expect(ENEMY_DEFS.mender.auraRegenPerSec).toBeGreaterThan(0); // Support (heal)
    expect(ENEMY_DEFS.cantor.auraShield).toBeGreaterThan(0); // Support (shield)
    expect(ENEMY_DEFS.bomber.explodeDamage).toBeGreaterThan(0); // Suicide
    expect(ENEMY_DEFS.popper.explodeDamage).toBeGreaterThan(0);
    expect(ENEMY_DEFS.siegeworm.siege?.range).toBeGreaterThan(0); // Artillery
    expect(ENEMY_DEFS.spitter.siege?.range).toBeGreaterThan(0);
    expect(ENEMY_DEFS.molerat.behavior.burrowing).toBe(true); // Burrowing
    expect(ENEMY_DEFS.gargoyle.behavior.flying).toBe(true); // Flying
    expect(ENEMY_DEFS.apex.behavior.avoidHero).toBeLessThan(0); // Elite: hunts the hero
    expect(ENEMY_DEFS.dreadnought.shieldHp).toBeGreaterThan(0); // Elite: fused traits
  });

  it('spawn wires the trait runtime from the def', () => {
    const g = new Game(1, NO_META);
    g.debugSpawn('bulwark', 1);
    expect(g.enemies[0].shield).toBe(ENEMY_DEFS.bulwark.shieldHp);
    const g2 = new Game(1, NO_META);
    g2.debugSpawn('broodmother', 1);
    expect(g2.enemies[0].summonCd).toBe(ENEMY_DEFS.broodmother.summon!.interval);
    const g3 = new Game(1, NO_META);
    g3.debugSpawn('siegeworm', 1);
    expect(g3.enemies[0].siegeCd).toBe(ENEMY_DEFS.siegeworm.siege!.interval);
  });

  it('a Summoner births its adds during a wave', () => {
    const g = new Game(3, NO_META);
    g.startWave(); // wave 1 (runners only — a mite can only come from the summoner)
    g.debugSpawn('broodmother', 1);
    let sawMite = false;
    for (let i = 0; i < 480 && g.phase === 'wave'; i++) {
      g.advance(SIM_DT);
      if (g.enemies.some((e) => e.kind === 'mite')) { sawMite = true; break; }
    }
    expect(sawMite).toBe(true);
  });

  it('a Regenerating enemy heals its wounds over time', () => {
    const g = new Game(2, NO_META);
    g.startWave();
    g.debugSpawn('knitter', 1);
    const k = g.enemies.find((e) => e.kind === 'knitter')!;
    k.hp = 50; // wound it; it sits up-field, away from the hero
    for (let i = 0; i < 30; i++) g.advance(SIM_DT); // ~0.5s of regen, no incoming damage
    expect((g.enemies.find((e) => e.kind === 'knitter')?.hp ?? 0)).toBeGreaterThan(50);
  });

  it('an Artillery enemy LOBS a visible shell; Nucleus damage lands on IMPACT, not at fire time', () => {
    const g = new Game(5, NO_META);
    g.startWave();
    g.debugSpawn('siegeworm', 1);
    const worm = g.enemies.find((e) => e.kind === 'siegeworm')!;
    worm.y = 700; // deep inside the standoff band → it plants and bombards
    const integrity0 = g.integrity;
    let guard = 0;
    // Cull everything else each tick so only the bombardment can touch integrity.
    const cull = (): void => { for (const e of g.enemies) if (e.kind !== 'siegeworm') { e.hp = 0; e.alive = false; } };
    while (g.enemyShells.length === 0 && guard++ < 600) { cull(); g.advance(SIM_DT); }
    expect(g.enemyShells.length).toBeGreaterThan(0); // the shell is airborne…
    expect(g.integrity).toBe(integrity0); // …and NOTHING has landed yet
    while (g.enemyShells.length > 0 && guard++ < 2000) { cull(); g.advance(SIM_DT); }
    expect(g.integrity).toBeLessThan(integrity0); // impact applied on arrival
  });

  it('a broken shield sets the shatter flash (the visible crack moment)', () => {
    const g = new Game(7, NO_META);
    for (let i = 0; i < 2; i++) g.placeTower('needle', towerSlots[i].x, towerSlots[i].y);
    g.startWave();
    g.debugSpawn('bulwark', 1);
    const b = g.enemies.find((e) => e.kind === 'bulwark')!;
    b.y = towerSlots[0].y - 120;
    b.speed = 0; // pin it in tower range so the needles chew the shield down
    let guard = 0;
    while ((b.shield ?? 0) > 0 && b.alive && guard++ < 4000) g.advance(SIM_DT);
    expect(b.shield ?? 0).toBeLessThanOrEqual(0); // the shield actually broke…
    expect(b.shieldFlash).not.toBeUndefined(); // …and the crack moment was marked for the renderer
  });

  it('the endless Director fields a varied bestiary (integration)', () => {
    const KINDS: TowerKind[] = ['needle', 'mortar', 'reactor'];
    const g = new Game(99, NO_META, undefined, undefined, undefined, { mode: 'endless' });
    const seen = new Set<string>();
    let t = 0;
    let guard = 0;
    while (t < 60 && g.phase !== 'lost' && guard++ < 80_000) {
      if (g.phase === 'draft') { g.chooseCard(g.getSnapshot().draft![0].id); continue; }
      if (g.phase === 'prep') {
        for (let i = 0; i < 6 && i < towerSlots.length; i++) g.placeTower(KINDS[i % 3], towerSlots[i].x, towerSlots[i].y);
        g.startWave();
      }
      g.advance(SIM_DT);
      t += SIM_DT;
      for (const e of g.enemies) seen.add(e.kind);
    }
    expect(seen.size).toBeGreaterThan(5); // many distinct archetypes, not just runners
  });
});
