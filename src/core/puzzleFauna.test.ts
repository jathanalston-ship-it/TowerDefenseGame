// PUZZLE FAUNA (docs/ENEMIES.md §puzzle) — six trait fusions, each authored around the ONE answer it
// demands. Pins the data contract (derived campaign entry stages, home-biome signatures, the golden
// control — the scripted WAVES never spawn them, the pinned 1–3 onboarding pools untouched) and each
// puzzle's mechanics in a live sim (the summoner births FLIERS, the veil shields from the air, the
// bombard is pullable, the borer re-knits).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { ENEMY_DEFS, SIM_DT, TOWER_DEFS, WAVES, enemyDeathCue } from './config';
import { generateStage } from './campaign';
import { BIOMES } from './biomes';
import { towerSlots, nucleusPoint } from './map';
import type { EnemyKind, MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const ALL_TOWERS = Object.keys(TOWER_DEFS) as TowerKind[];

/** kind → [derived campaign entry stage, home biome id]. */
const PUZZLE: Record<string, [number, string]> = {
  scuttler: [4, 'carapace'],
  blightmoth: [4, 'umbral'],
  borer: [6, 'necrotic'],
  shellback: [7, 'molten'],
  veilmoth: [8, 'tempest'],
  wispmother: [9, 'neural'],
};
const KINDS = Object.keys(PUZZLE) as EnemyKind[];

function park(g: Game): void {
  for (const h of g.heroes) { h.x = 30; h.y = 30; }
}

describe('the data contract', () => {
  it.each(KINDS)('%s enters the campaign at its DERIVED stage (traits → unlockStage), not before', (k) => {
    const [entry] = PUZZLE[k];
    expect(generateStage(entry - 1).enemyPool).not.toContain(k);
    expect(generateStage(entry).enemyPool).toContain(k);
  });

  it('the pinned onboarding stages 1–3 keep their exact pools (no puzzle kind before stage 4)', () => {
    for (const st of [1, 2, 3]) for (const k of KINDS) expect(generateStage(st).enemyPool).not.toContain(k);
  });

  it.each(KINDS)('%s is a signature kind of exactly its home biome', (k) => {
    const [, home] = PUZZLE[k];
    const homes = BIOMES.filter((b) => b.mods.signature.includes(k)).map((b) => b.id);
    expect(homes).toEqual([home]);
  });

  it('golden control: the scripted Stage WAVES never spawn a puzzle kind', () => {
    for (const w of WAVES) for (const g of w) expect(KINDS).not.toContain(g.kind);
  });

  it('death timbres auto-classify from the traits (plate cracks, the bomb pops, the veil screeches)', () => {
    expect(enemyDeathCue(ENEMY_DEFS.scuttler)).toBe('edie_crack');
    expect(enemyDeathCue(ENEMY_DEFS.blightmoth)).toBe('edie_pop');
    expect(enemyDeathCue(ENEMY_DEFS.shellback)).toBe('edie_crack');
    expect(enemyDeathCue(ENEMY_DEFS.veilmoth)).toBe('edie_screech');
  });
});

describe('each puzzle, live', () => {
  it('the Wisp Mother births FLYING wisps behind the line', () => {
    const g = new Game(5, NO_META);
    g.god = true;
    g.startWave();
    g.debugSpawn('wispmother', 1);
    const mom = g.enemies.find((e) => e.kind === 'wispmother')!;
    for (let i = 0; i < Math.ceil(5 / SIM_DT); i++) { mom.x = 380; mom.y = 200; park(g); g.advance(SIM_DT); }
    const wisps = g.enemies.filter((e) => e.kind === 'wisp' && e.alive);
    expect(wisps.length).toBeGreaterThan(0);
    expect(ENEMY_DEFS.wisp.behavior.flying).toBe(true);
  });

  it('the Veil Moth tops up the shields of the pack it hovers over', () => {
    const g = new Game(5, NO_META);
    g.god = true;
    g.startWave();
    g.debugSpawn('veilmoth', 1);
    g.debugSpawn('brute', 1);
    const veil = g.enemies.find((e) => e.kind === 'veilmoth')!;
    const brute = g.enemies.find((e) => e.kind === 'brute')!;
    expect(brute.shield ?? 0).toBe(0);
    for (let i = 0; i < 30; i++) { veil.x = 380; veil.y = 200; brute.x = 400; brute.y = 210; park(g); g.advance(SIM_DT); }
    expect(brute.shield ?? 0).toBeGreaterThan(0);
  });

  it('the Marrow Borer re-knits: chip that stops is undone', () => {
    const g = new Game(5, NO_META);
    g.god = true;
    g.startWave();
    g.debugSpawn('borer', 1);
    const b = g.enemies.find((e) => e.kind === 'borer')!;
    b.hp = b.maxHp * 0.5;
    for (let i = 0; i < Math.ceil(2 / SIM_DT); i++) { b.x = 380; b.y = 120; park(g); g.advance(SIM_DT); }
    expect(b.hp).toBeGreaterThan(b.maxHp * 0.5 + ENEMY_DEFS.borer.regenPerSec! * 1.5);
  });

  it('the Shellback Bombard is PULLABLE — an undertow pulse drags it back up-lane (its counter works)', () => {
    const g = new Game(7, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
    g.god = true;
    g.debugAddBiomass(4000);
    const rear = [...towerSlots].sort((a, c) => Math.hypot(a.x - nucleusPoint.x, a.y - nucleusPoint.y) - Math.hypot(c.x - nucleusPoint.x, c.y - nucleusPoint.y));
    const at = rear.find((s) => g.placeTower('polyp', s.x, s.y))!;
    g.startWave();
    g.debugSpawn('shellback', 1);
    const sb = g.enemies.find((e) => e.kind === 'shellback')!;
    sb.x = at.x; sb.y = at.y - 100; // inside the 165 px undertow
    let maxJump = 0;
    for (let i = 0; i < Math.ceil(2 / SIM_DT); i++) {
      const y0 = sb.y;
      park(g);
      g.advance(SIM_DT);
      maxJump = Math.max(maxJump, y0 - sb.y);
    }
    expect(maxJump).toBeGreaterThanOrEqual(40); // one instantaneous drag of ~TOWER_DEFS.polyp pull (46)
  });
});
