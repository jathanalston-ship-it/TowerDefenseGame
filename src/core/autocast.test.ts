// Primary-hero AUTO-CAST (docs/HEROES.md): an in-run Biomass unlock + free toggle that lets the
// primary hero fire its signature ability on cooldown, like the autonomous slots 2+.
import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, HERO_AUTOCAST } from './config';
import type { MetaModifiers, Enemy } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 } as MetaModifiers;

/** Advance a live wave with a pinned enemy in the hero's path; report whether the primary hero
 *  EVER cast its ability (abilityCd jumps above 0 only on a cast). */
function primaryEverCasts(setup: (g: Game) => void, ticks = 400): boolean {
  const game = new Game(1, NO_META);
  game.debugAddBiomass(100000);
  setup(game);
  game.startWave();
  game.debugSpawn('tank');
  const e: Enemy = game.enemies[game.enemies.length - 1];
  for (let i = 0; i < ticks; i++) {
    e.x = 360; e.y = 560; e.alive = true; e.hp = e.maxHp; // mid-field, where the roaming hero passes
    game.advance(SIM_DT);
    if (game.heroes[0].abilityCd > 0) return true;
  }
  return false;
}

describe('primary-hero auto-cast', () => {
  it('buyAutocast spends biomass exactly once and unlocks + enables', () => {
    const game = new Game(1, NO_META);
    game.debugAddBiomass(1000);
    const before = game.getSnapshot().biomass;
    expect(game.buyAutocast()).toBe(true);
    const snap = game.getSnapshot();
    expect(snap.biomass).toBe(before - HERO_AUTOCAST.cost);
    expect(snap.autocast.unlocked).toBe(true);
    expect(snap.autocast.on).toBe(true);
    // second buy is a no-op (already owned) — no double charge
    expect(game.buyAutocast()).toBe(false);
    expect(game.getSnapshot().biomass).toBe(before - HERO_AUTOCAST.cost);
  });

  it('unaffordable purchase is refused and charges nothing', () => {
    const game = new Game(1, NO_META);
    game.debugAddBiomass(-100000); // drain below the cost
    expect(game.getSnapshot().biomass).toBeLessThan(HERO_AUTOCAST.cost);
    expect(game.buyAutocast()).toBe(false);
    expect(game.getSnapshot().autocast.unlocked).toBe(false);
  });

  it('a DEFAULT game never auto-casts the primary hero (golden safety)', () => {
    expect(primaryEverCasts(() => {})).toBe(false);
  });

  it('after unlocking, the primary hero auto-casts when an enemy is in range', () => {
    expect(primaryEverCasts((g) => { g.buyAutocast(); })).toBe(true);
  });

  it('toggling auto-cast OFF stops the primary hero from casting', () => {
    expect(primaryEverCasts((g) => { g.buyAutocast(); g.toggleAutocast(); })).toBe(false); // unlocked but OFF
  });

  it('toggleAutocast is a no-op until unlocked', () => {
    const game = new Game(1, NO_META);
    game.toggleAutocast();
    expect(game.getSnapshot().autocast.on).toBe(false);
  });
});
