// RIPTIDE (Kinetic tide) — the roster's WATER-form and its zone-control identity. Pins:
//   • the current: its tidal pulse really CHIPS the pack (real AoE damage) and speaks only
//     the Disruption drag — never another class's status language (no Corrosion/Infection);
//   • the undertow: Maelstrom floods the ground with a lingering pool that keeps grinding
//     (the Vitriol-established pool verbs on a Kinetic chassis — water, not acid);
//   • the ★5 forks pull the two levers apart (Abyssal Pull deepens the pools, Tsunami the
//     slams) while ★0 stays the authored base (golden-safe);
//   • uniquely progression-gated on the RAID axis (megaSlain) — the FOURTH milestone lens,
//     never Shards. Fully data-driven: control movement + pulse chassis + pool/disrupt verbs
//     are all established sim paths (no new game.ts code shipped with this hero).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { HERO_DEFS, SIM_DT, resolveHeroKit } from './config';
import type { MetaModifiers } from './types';
import { defaultSave } from '../save/saveStore';
import { heroIdentity } from './heroIdentity';
import { isHeroUnlocked, meta } from '../state/meta';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('Riptide — the drowned tide (Kinetic zone control)', () => {
  it('its tidal pulse chips the pack in its own status language: the Disruption drag only', () => {
    const g = new Game(5, NO_META, undefined, 'riptide');
    g.startWave();
    g.debugSpawn('brute', 4);
    const h = g.heroes[0];
    expect(h.kind).toBe('riptide');
    let sawDrag = false; // the 0.25s drag window can lapse between pulses — sample DURING the loop
    for (let i = 0; i < 240; i++) {
      for (const e of g.enemies) { e.x = h.x; e.y = h.y; } // pin the pack in the current
      g.advance(SIM_DT);
      sawDrag = sawDrag || g.enemies.some((e) => e.disrupt > 0);
    }
    expect(g.getRunStats().damageDealt).toBeGreaterThan(30); // the current chips (11 dmg / 1.3s AoE)
    expect(sawDrag).toBe(true); // the drag took hold
    // Identity control: water drags — it never corrodes or infects.
    expect(g.enemies.every((e) => e.infection === 0)).toBe(true);
    expect(g.enemies.every((e) => (e.corrosion ?? 0) === 0)).toBe(true);
  });

  it('Maelstrom floods the ground: a lingering undertow pool that keeps grinding', () => {
    const g = new Game(5, NO_META, undefined, 'riptide');
    g.startWave();
    g.debugSpawn('brute', 3);
    const h = g.heroes[0];
    for (const e of g.enemies) { e.x = h.x; e.y = h.y; }
    expect(g.pools.length).toBe(0);
    g.armAbility();
    g.click(h.x, h.y); // the vortex slams down
    expect(g.pools.length).toBeGreaterThan(0); // …and the water STAYS
    for (let i = 0; i < 12; i++) g.advance(SIM_DT); // let the crush + first grind land
    const afterBurst = g.getRunStats().damageDealt;
    expect(afterBurst).toBeGreaterThan(0); // the crush landed
    for (let i = 0; i < Math.ceil(2 / SIM_DT); i++) {
      for (const e of g.enemies) { e.x = h.x; e.y = h.y; } // hold them in the undertow
      g.advance(SIM_DT);
    }
    expect(g.getRunStats().damageDealt).toBeGreaterThan(afterBurst + 20); // the pool ground on
  });

  it('the ★5 forks pull the two levers apart; the ★0 base stays authored (golden-safe)', () => {
    const base = resolveHeroKit('riptide', 0);
    expect(base.ult.name).toBe('Maelstrom');
    expect(base.ult.poolDps).toBe(16); // the authored undertow
    const abyss = resolveHeroKit('riptide', 5, { '5': 'abyss' });
    expect(abyss.ult.poolDps).toBeCloseTo(24, 9); // ×1.5 — the deep claims more
    expect(abyss.ult.damage).toBe(base.ult.damage); // the slam untouched
    const tsunami = resolveHeroKit('riptide', 5, { '5': 'tsunami' });
    expect(tsunami.ult.damage).toBeGreaterThan(base.ult.damage); // the wall rises
    expect(tsunami.ult.poolDps).toBe(base.ult.poolDps); // the pools untouched
  });

  it('wires the shared identity verbs: the vulnField passive + the dragging trait', () => {
    const id = heroIdentity('riptide');
    expect(id.passive.kind).toBe('vulnField'); // heroVulnBonus sums it generically
    expect(id.trait.kind).toBe('targetHijack'); // the current DRAGS
    expect(id.scaling.kind).toBe('overload');
  });
});

describe('Riptide — uniquely progression-gated (the raid axis)', () => {
  it('locked on a fresh account; unlocks at 2 distinct Mega Boss kills; the FOURTH gate axis', () => {
    const fresh = defaultSave();
    expect(isHeroUnlocked(fresh, 'riptide')).toBe(false);
    expect(fresh.heroUnlocked).not.toContain('riptide'); // milestone heroes never ride the array
    // its gate is the raid ledger — distinct from Vitriol's chassis breadth, the Revenant's
    // Infinite depth, and the Knell's Molt (each milestone hero owns one progression lens).
    expect(HERO_DEFS.riptide.unlock).toEqual({ kind: 'megaSlain', count: 2, label: 'Fell 2 distinct Mega Bosses' });
    expect(HERO_DEFS.riptide.unlockShards).toBeUndefined(); // never bought with Shards
    expect(isHeroUnlocked({ ...fresh, megaProgress: { ...fresh.megaProgress, slain: ['voraxis'] } }, 'riptide')).toBe(false); // one leviathan is not a tide
    expect(isHeroUnlocked({ ...fresh, megaProgress: { ...fresh.megaProgress, slain: ['voraxis', 'meridia'] } }, 'riptide')).toBe(true);
  });

  it('can never be claimed with Hero Shards (milestone-only)', () => {
    meta.reset();
    expect(meta.unlockHero('riptide')).toBe(false);
  });
});
