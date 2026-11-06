// CLASS BONDS (docs/CLASS-BONDS.md): the class set bonus. Pins the tables (thresholds, level scaling,
// cost, Power), the sim contract (OFF unless the run opts in — golden-safe; 2/4/6 fielded units wake
// I/II/III while deployed; heroes count; the bond reaches tower damage + fire rate and hero damage;
// Vital mends the Core at a clear; Resonant speeds every tower), and the save field (v58).

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { BOND, CLASS_BONDS, bondCost, bondFx, bondLevelMult, bondNext, bondTier, bondTierFx, classBondsPowerMult, sanitizeClassBonds } from './classBonds';
import { COMBAT_CLASS_ORDER } from './combatClass';
import { HERO_DEFS, SIM_DT, TOWER_DEFS, TOWER_ORDER } from './config';
import { towerSlots } from './map';
import type { MetaModifiers, TowerKind } from './types';
import { CURRENT_VERSION, defaultSave, parseImport } from '../save/saveStore';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const anyG = (g: Game): Record<string, unknown> & { bond: ReturnType<typeof bondFx> | null } => g as never;
const step = (g: Game, seconds: number): void => {
  for (let i = 0, n = Math.round(seconds / SIM_DT); i < n && g.phase !== 'won' && g.phase !== 'lost'; i++) g.advance(SIM_DT);
};
const place = (g: Game, kinds: TowerKind[]): void => {
  g.debugAddBiomass(10_000); // placement costs — the bond, not the bank, is under test
  kinds.forEach((k, i) => { g.selectTower(k); g.click(towerSlots[i].x, towerSlots[i].y); });
};
const ofClass = (cls: string): TowerKind[] => TOWER_ORDER.filter((k) => TOWER_DEFS[k].combatClass === cls);

describe('class bonds — the tables', () => {
  it('2 / 4 / 6 units wake Bond I / II / III; the next threshold is honest', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(bondTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect([0, 1, 2, 4, 6].map(bondNext)).toEqual([2, 2, 4, 6, null]);
  });

  it('every class has a bond with three strictly stronger tiers', () => {
    for (const c of COMBAT_CLASS_ORDER) {
      const tiers = CLASS_BONDS[c].tiers;
      expect(tiers).toHaveLength(3);
      const size = (t: (typeof tiers)[number]): number => (t.dmg ?? 0) + (t.rate ?? 0) + (t.allRate ?? 0) + (t.coreMend ?? 0) / 100;
      expect(size(tiers[1])).toBeGreaterThan(size(tiers[0]));
      expect(size(tiers[2])).toBeGreaterThan(size(tiers[1]));
    }
  });

  it('a bond level scales every tier (level 10 ⇒ ×1.8); cost compounds; Power is ×1 with no levels', () => {
    expect(bondLevelMult(0)).toBe(1);
    expect(bondLevelMult(BOND.maxLevel)).toBeCloseTo(1.8, 10);
    expect(bondLevelMult(99)).toBe(bondLevelMult(BOND.maxLevel)); // clamped
    expect(bondTierFx('Kinetic', 2, 5).dmg).toBeCloseTo(0.2 * 1.4, 10);
    expect(bondCost(1)).toBeGreaterThan(bondCost(0));
    expect(classBondsPowerMult(undefined)).toBe(1);
    expect(classBondsPowerMult({})).toBe(1);
    expect(classBondsPowerMult({ Kinetic: 2, Viral: 1 })).toBeCloseTo(1 + 3 * BOND.powerPerLevel, 10);
  });

  it('the fold counts units, wakes tiers and multiplies only the bonded classes', () => {
    const fx = bondFx(['Kinetic', 'Kinetic', 'Kinetic', 'Kinetic', 'Resonant', 'Resonant', 'Vital'], {});
    expect(fx.tiers.Kinetic).toBe(2);
    expect(fx.dmg.Kinetic).toBeCloseTo(1.2, 10);
    expect(fx.tiers.Resonant).toBe(1);
    expect(fx.allRate).toBeCloseTo(1.03, 10);
    expect(fx.tiers.Vital).toBe(0);
    expect(fx.dmg.Caustic).toBe(1);
    expect(fx.coreMend).toBe(0);
  });
});

describe('class bonds — in the sim', () => {
  it('OFF unless the run opts in: no bond state, no snapshot field (the golden path is untouched)', () => {
    const g = new Game(7, NO_META);
    place(g, ofClass('Kinetic').slice(0, 2).concat(ofClass('Kinetic').slice(0, 2)));
    step(g, 1);
    expect(anyG(g).bond).toBeNull();
    expect(g.getSnapshot().bonds).toBeUndefined();
  });

  it('two fielded units of a class wake its bond — and the hero counts', () => {
    const g = new Game(7, NO_META, undefined, 'ravager', undefined, { classBonds: {} }); // Ravager is Kinetic
    expect(HERO_DEFS.ravager.combatClass).toBe('Kinetic');
    step(g, 0.1);
    expect(g.getSnapshot().bonds).toEqual([{ cls: 'Kinetic', count: 1, tier: 0, next: 2 }]);
    place(g, ['needle']); // Needle Spitter: Kinetic
    step(g, 0.1);
    const k = g.getSnapshot().bonds!.find((b) => b.cls === 'Kinetic')!;
    expect(k).toEqual({ cls: 'Kinetic', count: 2, tier: 1, next: 4 });
    expect(anyG(g).bond!.dmg.Kinetic).toBeCloseTo(1 + CLASS_BONDS.Kinetic.tiers[0].dmg!, 10);
  });

  it('the bond reaches tower damage + fire rate and hero damage — and leaves other classes alone', () => {
    const levels = { Kinetic: 3 };
    const on = new Game(7, NO_META, undefined, 'ravager', undefined, { classBonds: levels });
    const off = new Game(7, NO_META, undefined, 'ravager');
    for (const g of [on, off]) { place(g, ['needle', 'needle', 'needle', 'mortar']); step(g, 0.1); }
    const priv = (g: Game) => g as unknown as {
      towers: { kind: TowerKind }[]; heroes: unknown[];
      towerAttackMods(t: unknown, def: unknown, prog: unknown, bk: null, ks: number, rb: number, rc: null): { dmgMult: number; rateMult: number };
      heroDamageMult(h: unknown): number; towerProgress: Record<string, unknown>;
    };
    const mods = (g: Game, kind: TowerKind) => { const p = priv(g); const t = p.towers.find((x) => x.kind === kind)!; return p.towerAttackMods(t, TOWER_DEFS[kind], p.towerProgress[kind], null, 1, 1, null); };
    const kTier = bondTierFx('Kinetic', 2, 3); // 3 needles + Ravager = 4 Kinetic ⇒ Bond II at level 3
    expect(mods(on, 'needle').dmgMult / mods(off, 'needle').dmgMult).toBeCloseTo(1 + kTier.dmg, 10);
    expect(mods(on, 'mortar').dmgMult).toBe(mods(off, 'mortar').dmgMult); // Caustic: 1 unit, no bond
    expect(priv(on).heroDamageMult(priv(on).heroes[0]) / priv(off).heroDamageMult(priv(off).heroes[0])).toBeCloseTo(1 + kTier.dmg, 10);
  });

  it('Vital (Sustain) mends the Core at a clear; a rising tier is announced on the board', () => {
    const vital = ofClass('Vital').filter((k) => TOWER_DEFS[k].firing !== 'summon').slice(0, 2);
    const g = new Game(3, NO_META, undefined, undefined, undefined, { classBonds: {} });
    step(g, 0.1); // the run is live (its opening fold is silent) — THEN the board grows into a bond
    place(g, vital);
    step(g, 0.1);
    expect(anyG(g).bond!.tiers.Vital).toBe(1);
    const floats = (g as unknown as { floats: { text: string }[] }).floats.map((f) => f.text).join(' ');
    expect(floats).toContain('SUSTAIN BOND I');
    (g as unknown as { integrity: number }).integrity = 50;
    g.startWave();
    g.debugKillAll();
    (g as unknown as { spawnQueue: unknown[]; spawnedAll: boolean }).spawnQueue.length = 0;
    (g as unknown as { spawnedAll: boolean }).spawnedAll = true;
    step(g, 0.2);
    expect((g as unknown as { integrity: number }).integrity).toBeGreaterThanOrEqual(50 + CLASS_BONDS.Vital.tiers[0].coreMend!);
  });

  it('is deterministic: the same bonded run replays to the same result', () => {
    const run = (): string => {
      const g = new Game(11, NO_META, undefined, 'ravager', undefined, { classBonds: { Kinetic: 2 } });
      g.god = true;
      place(g, ['needle', 'needle', 'needle']);
      for (let w = 0; w < 3 && g.phase !== 'won'; w++) {
        if (g.phase === 'draft') g.chooseCard(g.getSnapshot().draft![0].id);
        g.startWave();
        step(g, 25);
      }
      return `${g.kills}:${Math.round(g.biomass)}:${g.waveIndex}`;
    };
    expect(run()).toBe(run());
  });
});

describe('class bonds — the save (v58)', () => {
  it('levels sanitize to known classes and 0..max; a pre-v58 save loads with none', () => {
    expect(sanitizeClassBonds({ Kinetic: 3.7, Viral: -2, Nope: 4, Vital: 99 })).toEqual({ Kinetic: 3, Vital: BOND.maxLevel });
    expect(sanitizeClassBonds(null)).toEqual({});
    expect(CURRENT_VERSION).toBe(58);
    const old = { ...defaultSave() } as Record<string, unknown>;
    delete old.classBonds;
    const res = parseImport(JSON.stringify({ schemaVersion: 57, data: old }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.classBonds).toEqual({});
  });
});
