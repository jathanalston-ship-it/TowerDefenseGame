// Proves the unified grant/set/hook effect language (PROGRESSION-PHILOSOPHY §3A/B): a
// run-start `grant` makes every tower's shots pierce, a relic `hook` bends a battlefield
// rule (deaths spread Corrosion), and `set` writes a behavior-profile knob. All ride the
// same effect interpreter equipment/cards use; neutral when absent ⇒ golden-safe.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { applyCard, defaultRunModifiers } from './cards';
import type { CardContext, CardEffect } from './cards';
import { DEFENSE_TOP_Y, towerSlots } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };

/** Needle-only defense (no native Corrosion source), god-mode, saturated lane. */
function run(runEffects: CardEffect[], secs: number): { kills: number; sawCorrosion: boolean } {
  const game = new Game(2024, NO_META, undefined, 'ravager', undefined, { runEffects });
  game.god = true;
  game.debugAddBiomass(100000);
  for (const s of towerSlots) if (s.y < DEFENSE_TOP_Y + 120) game.placeTower('needle', s.x, s.y);
  game.startWave();
  game.debugSpawn('runner', 600);
  let t = 0;
  let guard = 0;
  let sawCorrosion = false;
  while (t < secs && game.phase === 'wave' && guard++ < 40000) {
    game.advance(SIM_DT);
    t += SIM_DT;
    for (const e of game.enemies) if (e.corrosion > 0) sawCorrosion = true;
  }
  return { kills: game.getSnapshot().kills, sawCorrosion };
}

describe('unified effect language', () => {
  it('grant: a run-wide projectile mutator makes every tower pierce (more kills)', () => {
    const base = run([], 12).kills;
    const granted = run([{ op: 'grant', grant: { kind: 'towerProjectileMutator', id: 'pierce2' } }], 12).kills;
    expect(granted).toBeGreaterThan(base);
  });

  it('hook: a relic rule spreads Corrosion on death (needles alone never corrode)', () => {
    expect(run([], 12).sawCorrosion).toBe(false);
    const cursed: CardEffect = { op: 'hook', hook: { on: 'enemyKilled', action: { do: 'spreadStatus', status: 'Corrosion', amount: 2, radius: 60 } } };
    expect(run([cursed], 12).sawCorrosion).toBe(true);
  });

  it('set: writes a string behavior-profile knob through the same interpreter', () => {
    const mods = defaultRunModifiers();
    const ctx: CardContext = { mods, grantBiomass: () => {}, grantIntegrity: () => {}, healHero: () => {} };
    expect(mods.heroAnchor).toBe('default');
    applyCard({ id: 't', name: 'T', rarity: 'common', category: 'hero', description: '', effects: [{ op: 'set', field: 'heroAnchor', value: 'nucleus' }] }, ctx);
    expect(mods.heroAnchor).toBe('nucleus');
  });
});
