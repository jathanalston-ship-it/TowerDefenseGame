// FOVEA (Neural eye) — the rear-line EXECUTIONER lance. Pins:
//   • the chassis: a true ranged single-strike attacker on the siege brain (attackRange 640,
//     colossal slow hits, no splash) — it kills from across the field;
//   • the identity: the shared elite-hunter verbs (+damage vs elites, killchain scaling) on a
//     second hero — the generic hooks, not Ravager-specific code;
//   • the ★8 Terminal Glare fork turns Pinning Glare into a single-target sentence;
//   • Shard-claimed (the third Collection unlock, 160) — never milestone-gated.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { HERO_DEFS, SIM_DT, resolveHeroKit } from './config';
import type { MetaModifiers } from './types';
import { defaultSave } from '../save/saveStore';
import { heroIdentity } from './heroIdentity';
import { heroShardUnlockPool, isHeroUnlocked } from '../state/meta';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('Fovea — the executioner lance (Neural)', () => {
  it('strikes from the rear line: lances land on the wave while the eye never advances', () => {
    const g = new Game(5, NO_META, undefined, 'fovea');
    g.startWave(); // the siege brain holds the rear and lances the deepest threat
    const h = g.heroes[0];
    expect(h.kind).toBe('fovea');
    let rearmost = Infinity;
    for (let i = 0; i < 60 * 12; i++) {
      g.advance(SIM_DT);
      rearmost = Math.min(rearmost, h.y); // track how far up-field it ever wandered
    }
    expect(g.getRunStats().damageDealt).toBeGreaterThan(150); // multiple 95-damage lances landed
    expect(rearmost).toBeGreaterThan(560); // …all from behind the defense line (never marched out)
  });

  it('wires the shared elite-hunter identity (generic hooks, second consumer)', () => {
    const id = heroIdentity('fovea');
    expect(id.passive.kind).toBe('eliteDamage');
    expect(id.trait.kind).toBe('eliteHunter');
    expect(id.scaling.kind).toBe('killchain');
    expect(HERO_DEFS.fovea.behavior).toBe('siege'); // the Vitriol's rear-line brain, reused
    expect(HERO_DEFS.fovea.attackSplash ?? 0).toBeLessThanOrEqual(20); // a pinpoint entry wound — execution, not bombardment
  });

  it('the ★8 Terminal Glare fork is a single-target sentence; the ★0 base stays authored', () => {
    const base = resolveHeroKit('fovea', 0);
    expect(base.ult.name).toBe('Apex Stare');
    expect(base.skills[0].name).toBe('Pinning Glare');
    // Compare the two ★8 PICKS at the same star (unpicked tiers default to their first option,
    // and stars carry their own damage growth — so base-vs-fork ratios are never clean).
    const allseeing = resolveHeroKit('fovea', 8, { '5': 'deadeye', '8': 'allseeing' });
    const terminal = resolveHeroKit('fovea', 8, { '5': 'deadeye', '8': 'terminal' });
    expect(terminal.skills[0].name).toBe('Terminal Glare');
    expect(allseeing.skills[0].name).toBe('Pinning Glare'); // the All-Seeing leaves skill 0 alone
    expect(terminal.skills[0].damage / allseeing.skills[0].damage).toBeCloseTo(2.2, 1);
    expect(terminal.skills[0].minEnemies).toBe(1);
    expect(allseeing.skills[1].name).toBe('The All-Seeing');
  });

  it('Shard-claimed: the third Collection unlock — it rides the shard pool, never a milestone', () => {
    const fresh = defaultSave();
    expect(isHeroUnlocked(fresh, 'fovea')).toBe(false);
    expect(HERO_DEFS.fovea.unlockShards).toBe(160);
    expect(HERO_DEFS.fovea.unlock).toBeUndefined(); // no milestone gate
    expect(heroShardUnlockPool(fresh)).toContain('fovea'); // shard drops fund it while locked
  });
});
