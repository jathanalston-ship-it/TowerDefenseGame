// KNELL (Resonant conductor) — the roster's SIXTH class and its amplification identity. Pins:
//   • the toll: its pulse really CHIPS the pack (AoE damage — unlike the Overseer's whisper)
//     with only a brief stagger, and never speaks another class's status language;
//   • the amp: Sundering Peal grants the timed run-wide towerDamage buff (the runBuffs bus —
//     refresh-not-stack), and the ★5 Crescendo fork deepens it through the new buff levers;
//   • uniquely progression-gated on the MOLT axis (prestige) — the third milestone axis,
//     never Shards;
//   • golden-safe: milestone-gated ⇒ never owned fresh, never fielded by autoplay; and the
//     default Ravager run never carries a run buff (the control).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { HERO_DEFS, SIM_DT, resolveHeroKit } from './config';
import type { MetaModifiers } from './types';
import { defaultSave } from '../save/saveStore';
import { isHeroUnlocked, meta } from '../state/meta';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('Knell — the tolling conductor (Resonant)', () => {
  it('its pulse tolls REAL AoE damage into the pack, in its own status language', () => {
    const g = new Game(5, NO_META, undefined, 'knell');
    g.startWave();
    g.debugSpawn('brute', 4);
    const h = g.heroes[0];
    expect(h.kind).toBe('knell');
    for (let i = 0; i < 240; i++) {
      for (const e of g.enemies) { e.x = h.x; e.y = h.y; } // pin the pack on the bell
      g.advance(SIM_DT);
    }
    expect(g.getRunStats().damageDealt).toBeGreaterThan(50); // the toll chips (14 dmg / 1.6s AoE)
    // Identity control: the bell speaks Resonance — never Corrosion or Infection.
    expect(g.enemies.every((e) => e.infection === 0)).toBe(true);
    expect(g.enemies.every((e) => (e.corrosion ?? 0) === 0)).toBe(true);
  });

  it('Sundering Peal rings the amp: a timed run-wide tower-damage buff that expires', () => {
    const g = new Game(5, NO_META, undefined, 'knell');
    g.startWave();
    g.debugSpawn('brute', 2);
    const h = g.heroes[0];
    g.armAbility();
    g.click(h.x, h.y); // the player-armed cast — the bell SLAMS
    expect(g.getSnapshot().buffs.some((b) => /% tower dmg/.test(b))).toBe(true); // +30% tower dmg (Ns)
    for (let i = 0; i < Math.ceil(8 / SIM_DT); i++) g.advance(SIM_DT); // ride past the 6s window
    expect(g.getSnapshot().buffs.some((b) => /% tower dmg/.test(b))).toBe(false); // …and it faded
  });

  it('the ★5 Crescendo fork deepens the amp through the buff levers (base kit untouched at ★0)', () => {
    const base = resolveHeroKit('knell', 0);
    expect(base.ult.buffAmount).toBe(1.3); // golden-safe: no stars ⇒ the authored base
    expect(base.ult.buffSeconds).toBe(6);
    const crescendo = resolveHeroKit('knell', 5, { '5': 'crescendo' });
    expect(crescendo.ult.buffAmount).toBeCloseTo(1.45, 9); // 1 + (1.3−1)×1.5
    expect(crescendo.ult.buffSeconds).toBe(8); // +2s
    const dirge = resolveHeroKit('knell', 5, { '5': 'dirge' });
    expect(dirge.ult.buffAmount).toBe(1.3); // the funerary fork leaves the amp alone
    expect(dirge.ult.damage).toBeGreaterThan(base.ult.damage);
  });

  it('the default Ravager run never carries a run buff (golden control)', () => {
    const g = new Game(5, NO_META); // defaults to the Ravager
    g.startWave();
    g.debugSpawn('brute', 3);
    for (let i = 0; i < 120; i++) g.advance(SIM_DT);
    expect(g.getSnapshot().buffs.length).toBe(0);
  });
});

describe('Knell — uniquely progression-gated (the Molt axis)', () => {
  it('locked on a fresh account; auto-unlocks at the first Molt; a THIRD distinct gate axis', () => {
    const fresh = defaultSave();
    expect(isHeroUnlocked(fresh, 'knell')).toBe(false);
    expect(fresh.heroUnlocked).not.toContain('knell'); // milestone heroes never ride the array
    // its gate is the prestige rebirth — distinct from Vitriol's chassis breadth and the
    // Revenant's Infinite depth (each milestone hero owns one progression lens).
    expect(HERO_DEFS.knell.unlock).toEqual({ kind: 'molts', count: 1, label: 'Complete your first Molt' });
    expect(HERO_DEFS.knell.unlockShards).toBeUndefined(); // never bought with Shards
    expect(isHeroUnlocked({ ...fresh, prestige: { ...fresh.prestige, molts: 1 } }, 'knell')).toBe(true);
  });

  it('can never be claimed with Hero Shards (milestone-only)', () => {
    meta.reset();
    expect(meta.unlockHero('knell')).toBe(false);
  });
});
