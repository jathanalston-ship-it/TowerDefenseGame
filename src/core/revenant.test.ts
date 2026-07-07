// REVENANT (Viral phase-assassin) — the roster's single-target boss-deleter. Pins its signatures:
//   • blink-strike: it TELEPORTS to the biggest threat (not a walk) and injects Infection;
//   • uniquely progression-gated: earned by reaching Infinite Depth (a distinct axis), never Shards;
//   • works fielded in any mode (the sim is mode-agnostic — endless control included).
// Golden-safe: the Revenant is milestone-gated (never owned on a fresh save), so autoplay (Ravager)
// never fields it — the last test is the control (the default hero neither infects nor teleports).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { HERO_DEFS, SIM_DT } from './config';
import { WIDTH } from './map';
import type { MetaModifiers } from './types';
import { defaultSave } from '../save/saveStore';
import { isHeroUnlocked, meta } from '../state/meta';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('Revenant blink-strike (the phase-assassin)', () => {
  it('BLINKS to its target (a teleport, not a walk), strikes it, and injects Infection', () => {
    const g = new Game(5, NO_META, undefined, 'revenant');
    g.startWave();
    g.debugSpawn('colossus', 1); // one fat target — the assassin's prey
    const h = g.heroes[0];
    expect(h.kind).toBe('revenant');
    const P = { x: WIDTH / 2, y: 240 }; // pin the prey far up-field so a blink reads as a big jump
    let maxHop = 0;
    let sawInfection = false;
    for (let i = 0; i < 200; i++) {
      for (const e of g.enemies) { e.x = P.x; e.y = P.y; }
      const px = h.x;
      const py = h.y;
      g.advance(SIM_DT);
      maxHop = Math.max(maxHop, Math.hypot(h.x - px, h.y - py));
      if (g.enemies.some((e) => e.infection > 0)) sawInfection = true;
    }
    expect(maxHop).toBeGreaterThan(100); // it TELEPORTED (a walk is ~4px/tick) — the blink signature
    expect(g.getRunStats().damageDealt).toBeGreaterThan(0); // the strike landed
    expect(sawInfection).toBe(true); // …and injected Infection (the Viral signature)
    expect(h.phaseFromX).not.toBeUndefined(); // the render-only blink state was set
  });

  it('fields and strikes the same in ENDLESS mode (mode-agnostic — campaign/infinite/daily all field heroes alike)', () => {
    const g = new Game(9, NO_META, undefined, 'revenant', undefined, { mode: 'endless' });
    g.startWave();
    g.debugSpawn('colossus', 1);
    const P = { x: WIDTH / 2, y: 300 };
    for (let i = 0; i < 120; i++) { for (const e of g.enemies) { e.x = P.x; e.y = P.y; } g.advance(SIM_DT); }
    expect(g.getRunStats().damageDealt).toBeGreaterThan(0);
    expect(g.enemies.some((e) => e.infection > 0)).toBe(true);
  });

  it('the Ravager neither injects Infection nor teleports (control of the golden default)', () => {
    const g = new Game(5, NO_META); // defaults to the Ravager
    g.startWave();
    g.debugSpawn('brute', 3);
    const h = g.heroes[0];
    let maxHop = 0;
    for (let i = 0; i < 120; i++) { const px = h.x; const py = h.y; g.advance(SIM_DT); maxHop = Math.max(maxHop, Math.hypot(h.x - px, h.y - py)); }
    expect(g.enemies.every((e) => e.infection === 0)).toBe(true); // the Ravager applies Fracture, not Infection
    expect(maxHop).toBeLessThan(40); // …and WALKS — no teleport
  });
});

describe('Revenant — uniquely progression-gated (Infinite Depth)', () => {
  it('locked on a fresh account; auto-unlocks at Infinite Depth 40; a DISTINCT gate axis', () => {
    const fresh = defaultSave();
    expect(isHeroUnlocked(fresh, 'revenant')).toBe(false);
    // its gate is Infinite depth — distinct from Vitriol's boss-slain and the Shard heroes' unlockShards
    expect(HERO_DEFS.revenant.unlock).toEqual({ kind: 'infiniteDepth', wave: 40, label: 'Reach Infinite Depth 40' });
    expect(HERO_DEFS.revenant.unlockShards).toBeUndefined(); // never bought with Shards
    expect(isHeroUnlocked({ ...fresh, bestWave: 39 }, 'revenant')).toBe(false);
    expect(isHeroUnlocked({ ...fresh, bestWave: 40 }, 'revenant')).toBe(true); // earned from the deep — auto-owned
  });

  it('can never be claimed with Hero Shards (milestone-only)', () => {
    meta.reset();
    expect(meta.unlockHero('revenant')).toBe(false); // milestone hero — not claimable, auto-unlocks on the feat
  });
});
