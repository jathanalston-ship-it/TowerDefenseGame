// Boss module-spine execution (docs/BOSS-DESIGN §2) — proves the Milestone-1 primitives actually
// RUN in the sim, not just exist as data: healer mends, splitter cleaves on death, carapace hardens.
// Bosses only tick in the 'wave' phase with a boss present, so these drive a real (undefended) wave.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { gameEvents } from './events';
import { SIM_DT } from './config';
import type { BossDef } from './boss';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

/** A fresh game pushed into the 'wave' phase (undefended — no towers) so bossSystem/deathSystem run. */
function waveGame(seed = 1): Game {
  const g = new Game(seed, NO_META);
  g.startWave();
  return g;
}
const boss = (g: Game) => g.enemies.find((e) => e.boss);
const advance = (g: Game, ticks: number) => { for (let i = 0; i < ticks; i++) g.advance(SIM_DT); };

const def = (over: Partial<BossDef> & Pick<BossDef, 'id' | 'modules' | 'phases'>): BossDef => ({
  name: 'Test Boss', chassis: 'controller', hpMult: 1, radius: 28, color: '#0f0', bounty: 10, damage: 8, modifiers: [], ...over,
});

describe('boss module spine — the Milestone-1 primitives execute in the sim', () => {
  it('healer pulses HP back onto the boss (kill-priority lesson)', () => {
    const g = waveGame(7);
    g.spawnBoss(def({ id: 'test_healer', modules: [{ kind: 'healer', cooldown: 0.5, amount: 300, radius: 220 }], phases: [{ threshold: 1, modules: [0] }] }));
    const b = boss(g)!;
    b.hp = b.maxHp - 1200; // wound it (undefended run ⇒ nothing else touches its HP)
    const wounded = b.hp;
    advance(g, 60); // ~1s: at least one heal pulse (first pulse at cooldown×0.6 = 0.3s)
    expect(boss(g)!.hp).toBeGreaterThan(wounded);
    expect(boss(g)!.hp).toBeLessThanOrEqual(boss(g)!.maxHp); // never over-heals
  });

  it('splitter cleaves into smaller copies on death (spread-damage lesson)', () => {
    const g = waveGame(9);
    g.spawnBoss(def({ id: 'test_split', modules: [{ kind: 'splitter', cooldown: 999, amount: 2, generations: 1 }], phases: [{ threshold: 1, modules: [] }] }));
    const parent = boss(g)!;
    const parentMax = parent.maxHp;
    parent.hp = 0; // slay it
    advance(g, 1); // deathSystem runs → splitBoss pushes the copies
    const children = g.enemies.filter((e) => e.boss && e.boss.defId === 'test_split');
    expect(children).toHaveLength(2); // amount: 2
    for (const c of children) {
      expect(c.boss!.splitsLeft).toBe(0); // one generation spent — the copies are terminal
      expect(c.maxHp).toBeLessThan(parentMax); // each is a fraction of the parent
    }
  });

  it('a splitter falls ONCE: bossKilled marks only its last piece final', () => {
    const g = waveGame(9);
    const finals: boolean[] = [];
    const off = gameEvents.on('bossKilled', (e) => finals.push(e.final));
    try {
      g.spawnBoss(def({ id: 'test_split', modules: [{ kind: 'splitter', cooldown: 999, amount: 2, generations: 1 }], phases: [{ threshold: 1, modules: [] }] }));
      boss(g)!.hp = 0;
      advance(g, 1); // the parent dies → two pieces
      expect(finals).toEqual([false]);
      const pieces = g.enemies.filter((e) => e.boss && e.boss.defId === 'test_split');
      pieces[0].hp = 0;
      advance(g, 1);
      expect(finals).toEqual([false, false]); // a sibling still lives
      pieces[1].hp = 0;
      advance(g, 1);
      expect(finals).toEqual([false, false, true]); // the last piece — THE fall
    } finally {
      off();
    }
  });

  it('carapace raises bonus armor for a window, then resets (crack-the-armor lesson)', () => {
    const g = waveGame(11);
    g.spawnBoss(def({ id: 'test_cara', modules: [{ kind: 'carapace', cooldown: 3, amount: 40, duration: 0.5 }], phases: [{ threshold: 1, modules: [0] }] }));
    advance(g, 130); // > cooldown×0.6 (1.8s) → the window fires
    expect(boss(g)!.boss!.carapace).toBe(40); // hardened
    advance(g, 45); // > duration (0.5s) → window closes before the next cast
    expect(boss(g)!.boss!.carapace).toBe(0); // soft again
  });
});
