// Hero ability KITS (HEROES.md) — the star-gated auto-cast skills layered on top of each hero's ult.
// Golden-safety is pinned by golden.test.ts (a fresh account has 0 stars ⇒ 0 skills ⇒ no cast); this
// covers the star-gate math, the compiled kit, and that an UNLOCKED skill actually auto-casts in-sim.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, HERO_ORDER, HERO_SKILLS, HERO_SKILL_DEFS, heroSkillCount } from './config';
import type { HeroKind, HeroProgress, MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

// A neutral HeroProgress with a chosen unlocked-skill count per hero (stars are folded upstream in meta).
function progressWith(skills: Partial<Record<HeroKind, number>>): HeroProgress {
  const out = {} as HeroProgress;
  for (const k of HERO_ORDER) out[k] = { damageMult: 1, cooldownMult: 1, skillCount: skills[k] ?? 0 };
  return out;
}

describe('hero kit — star gate + content', () => {
  it('skills unlock one at a time by star (★3 → 1, ★7 → 2); a fresh hero has none', () => {
    expect(heroSkillCount(0)).toBe(0);
    expect(heroSkillCount(2)).toBe(0);
    expect(heroSkillCount(3)).toBe(1);
    expect(heroSkillCount(6)).toBe(1);
    expect(heroSkillCount(7)).toBe(2);
    expect(heroSkillCount(10)).toBe(2);
  });

  it('every hero ships a real kit — 2 auto-cast skills, each compiled to at least one effect', () => {
    for (const k of HERO_ORDER) {
      expect(HERO_SKILL_DEFS[k].length, k).toBe(2);
      for (const comp of HERO_SKILLS[k]) expect(comp.length, k).toBeGreaterThan(0); // no empty (no-op) skill
    }
  });
});

describe('hero kit — auto-casts IN-SIM once unlocked', () => {
  it('a ★3 Ravager auto-casts Rend against a co-located pack (and a 0-star Ravager never does)', () => {
    function ravagerRun(skillCount: number): { rend: boolean; dmg: number } {
      const g = new Game(3, NO_META, undefined, 'ravager', progressWith({ ravager: skillCount }));
      g.startWave();
      g.debugSpawn('colossus', 4); // heavy pack — survives, satisfies Rend's minEnemies gate
      const h = g.heroes[0];
      let rend = false;
      for (let i = 0; i < 200 && g.phase === 'wave'; i++) {
        for (const e of g.enemies) { e.x = h.x; e.y = h.y - 30; } // pin the pack on the hero so the kit has a target
        g.advance(SIM_DT);
        if (g.floats.some((f) => f.text === 'Rend')) rend = true;
      }
      return { rend, dmg: g.getRunStats().damageDealt };
    }
    const unlocked = ravagerRun(1);
    expect(unlocked.rend).toBe(true);  // the kit fired during the wave
    expect(unlocked.dmg).toBeGreaterThan(0);
    expect(ravagerRun(0).rend).toBe(false); // 0 stars ⇒ no kit ⇒ never casts (the golden-safe control)
  });

  it('a self-cast utility skill (Shepherd Graft) fires with NO enemies present (minEnemies 0)', () => {
    const g = new Game(5, NO_META, undefined, 'shepherd', progressWith({ shepherd: 1 }));
    g.startWave();
    let graft = false;
    for (let i = 0; i < 120 && !graft; i++) { g.advance(SIM_DT); if (g.floats.some((f) => f.text === 'Graft')) graft = true; }
    expect(graft).toBe(true); // support skills self-cast on cooldown even on an empty field
  });
});
