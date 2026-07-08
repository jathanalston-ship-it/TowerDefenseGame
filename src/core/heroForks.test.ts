// HERO ABILITY FORKS (docs/HEROES.md §forks) — the ★5/★8 A/B choices REWORK a hero's already-
// unlocked abilities in place (the ult / kit skills), rather than bolting on new verbs. This pins
// (a) the golden-safety guarantee (0 stars / no picks ⇒ the base kit, byte-identical to the static
// consts the golden sim runs), (b) the patch math per tier, and (c) that a chosen fork threads all
// the way through a live Game to the HUD the player reads.
import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { HERO_DEFS, HERO_ORDER, HERO_ULT, HERO_SKILLS, resolveHeroKit, heroForkTiers } from './config';
import type { HeroProgress, MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 } as MetaModifiers;

/** A neutral hero-progress with a fixed skillCount for the fielded hero (unlocks kit skills so the
 *  HUD surfaces their gauges) — everything else identity. */
function progressWithSkills(kind: string, skillCount: number): HeroProgress {
  const r = {} as HeroProgress;
  for (const k of HERO_ORDER) r[k] = { damageMult: 1, cooldownMult: 1 };
  r[kind as keyof HeroProgress] = { damageMult: 1, cooldownMult: 1, skillCount };
  return r;
}

describe('hero forks — golden safety (no forks reached ⇒ the base kit)', () => {
  it('resolveHeroKit at 0 stars / no picks reproduces the static ult + skill components exactly', () => {
    for (const k of HERO_ORDER) {
      const kit = resolveHeroKit(k, 0, {});
      expect(kit.ultComps).toEqual(HERO_ULT[k]); // byte-identical to what the golden sim runs
      expect(kit.skillComps).toEqual(HERO_SKILLS[k]);
      // and the effective defs are the untouched base defs (name unchanged)
      expect(kit.ult.name).toBe(HERO_DEFS[k].ability.name);
    }
  });

  it('no fork tier is reached below ★5', () => {
    expect(heroForkTiers('ravager', 0)).toEqual([]);
    expect(heroForkTiers('ravager', 4)).toEqual([]);
    expect(heroForkTiers('ravager', 5)).toHaveLength(1); // ★5 tier reached
    expect(heroForkTiers('ravager', 7)).toHaveLength(1); // still only ★5 (★8 not reached)
    expect(heroForkTiers('ravager', 8)).toHaveLength(2); // ★5 + ★8
    expect(heroForkTiers('ravager', 10)).toHaveLength(2);
  });
});

describe('hero forks — the ★5 tier reworks the abilities in place (Ravager)', () => {
  const BASE_ULT = 62, BASE_REND_DMG = 36, BASE_REND_RADIUS = 56;

  it('Berserker (A, the default) amplifies the whole kit\'s damage', () => {
    const kit = resolveHeroKit('ravager', 5, {}); // no pick ⇒ first option = Berserker
    expect(kit.ult.damage).toBe(Math.round(BASE_ULT * 1.25)); // 78
    expect(kit.skills[0].name).toBe('Rend');
    expect(kit.skills[0].damage).toBe(Math.round(BASE_REND_DMG * 1.3)); // 47
    expect(kit.skills[0].fracture).toBe(2 + 1); // +1 Fracture
  });

  it('Juggernaut (B) widens the strikes instead, leaving base damage', () => {
    const kit = resolveHeroKit('ravager', 5, { '5': 'juggernaut' });
    expect(kit.ult.damage).toBe(BASE_ULT); // ult untouched by Juggernaut
    expect(kit.skills[0].damage).toBe(BASE_REND_DMG); // Rend damage untouched
    expect(kit.skills[0].radius).toBe(Math.round(BASE_REND_RADIUS * 1.4)); // 78 — wider
    expect(kit.skills[0].minEnemies).toBe(2);
  });
});

describe('hero forks — the ★8 tier is a hard A/B identity split (Ravager Rend)', () => {
  // Hold ★5 fixed (Juggernaut) so the ★8 delta is isolated and deterministic.
  const reaver = resolveHeroKit('ravager', 8, { '5': 'juggernaut', '8': 'reaver' });
  const slayer = resolveHeroKit('ravager', 8, { '5': 'juggernaut', '8': 'slayer' });

  it('renames Rend to the chosen path', () => {
    expect(reaver.skills[0].name).toBe('Reaving Cleave');
    expect(slayer.skills[0].name).toBe("Slayer's Rend");
  });

  it('Slayer is the focused executioner; Reaver is the wide cleave', () => {
    expect(slayer.skills[0].damage).toBeGreaterThan(reaver.skills[0].damage); // focused = far more punch
    expect(slayer.skills[0].radius).toBeLessThan(reaver.skills[0].radius); // …over a smaller area
    expect(slayer.skills[0].damage).toBe(Math.round(36 * 2.4)); // 86 (base 36, Juggernaut leaves damage)
    expect(reaver.skills[0].minEnemies).toBe(2);
  });

  it('gives each new ability its own cast VFX (unique particle + colour)', () => {
    expect(slayer.skills[0].particle).toBe('heroLance');
    expect(reaver.skills[0].particle).toBe('heroBurst');
    expect(slayer.skills[0].fxColor).not.toBe(reaver.skills[0].fxColor);
  });
});

describe('hero forks — a chosen fork threads through a live Game to the HUD', () => {
  it('Shepherd Bloodgrove renames the ULT the player sees (Bloom → Crimson Bloom)', () => {
    const base = new Game(1, NO_META, undefined, 'shepherd');
    base.selectHero('shepherd'); // the HUD hero panel reads the SELECTED champion
    const ability = base.getSnapshot().selectedHero?.cooldowns.find((c) => c.id === 'ability');
    expect(ability?.label).toBe('Bloom'); // control: base ult

    const forked = new Game(1, NO_META, undefined, 'shepherd', undefined, {
      heroAbilityKits: { shepherd: resolveHeroKit('shepherd', 8, { '8': 'bloodgrove' }) },
    });
    forked.selectHero('shepherd');
    const fAbility = forked.getSnapshot().selectedHero?.cooldowns.find((c) => c.id === 'ability');
    expect(fAbility?.label).toBe('Crimson Bloom'); // the ★8 fork rework
  });

  it('Ravager Slayer renames the unlocked kit SKILL on the HUD (Rend → Slayer\'s Rend)', () => {
    const g = new Game(1, NO_META, undefined, 'ravager', progressWithSkills('ravager', 2), {
      heroAbilityKits: { ravager: resolveHeroKit('ravager', 8, { '5': 'juggernaut', '8': 'slayer' }) },
    });
    g.selectHero('ravager');
    const skill0 = g.getSnapshot().selectedHero?.cooldowns.find((c) => c.id === 'skill0');
    expect(skill0?.label).toBe("Slayer's Rend");
  });
});
