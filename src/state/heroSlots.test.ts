// Hero Slot progression (HEROES.md) — pins the CAMPAIGN-gated unlock ladder, the clamped/distinct
// roster, the anticipation view, and the save migration. The multi-hero gameplay is golden-safe
// (single-hero runs stay byte-identical — see golden.test); this covers the meta/save layer.

import { describe, it, expect } from 'vitest';
import { heroSlotsUnlocked, fieldedLoadout, heroSlotView } from './meta';
import { defaultSave, parseImport } from '../save/saveStore';
import { HERO_ORDER, HERO_SLOTS, SIM_DT } from '../core/config';
import { Game } from '../core/game';
import type { MetaModifiers } from '../core/types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('hero slots', () => {
  it('a fresh account fields exactly ONE hero (single-hero ⇒ golden-safe)', () => {
    const s = defaultSave();
    expect(heroSlotsUnlocked(s)).toBe(1);
    expect(fieldedLoadout(s)).toEqual([s.selectedHero]);
  });

  it('slot 2 unlocks at Campaign 25; slot 3 at Campaign 90 (campaign-gated)', () => {
    const s = defaultSave();
    s.campaign.cleared.standard = 0; expect(heroSlotsUnlocked(s)).toBe(1);
    s.campaign.cleared.standard = 24; expect(heroSlotsUnlocked(s)).toBe(1); // one short of slot 2
    s.campaign.cleared.standard = 25; expect(heroSlotsUnlocked(s)).toBe(2);
    s.campaign.cleared.standard = 89; expect(heroSlotsUnlocked(s)).toBe(2); // still 2 until stage 90
    s.campaign.cleared.standard = 90; expect(heroSlotsUnlocked(s)).toBe(3);
    s.campaign.cleared.standard = 999; expect(heroSlotsUnlocked(s)).toBe(HERO_SLOTS.length); // never exceeds the ladder
  });

  it('the highest cleared stage across difficulties gates the slots', () => {
    const s = defaultSave();
    s.campaign.cleared = { standard: 10, brutal: 25 }; // brutal is further → slot 2 unlocked
    expect(heroSlotsUnlocked(s)).toBe(2);
  });

  it('the fielded loadout clamps to unlocked slots and stays DISTINCT', () => {
    const [a, b, c] = HERO_ORDER;
    const s = defaultSave();
    s.campaign.cleared.standard = 25; // 2 slots unlocked
    s.heroUnlocked = [a, b, c]; // own all heroes → this pins slot-clamp/distinct, not the unlock gate
    s.heroLoadout = [a, b, c]; // 3 assigned, but only 2 slots → clamp
    expect(fieldedLoadout(s)).toEqual([a, b]);
    s.heroLoadout = [a, a]; // duplicates collapse to a distinct roster
    expect(fieldedLoadout(s)).toEqual([a]);
  });

  it('the slot view shows LOCKED slots with their Campaign unlock req + progress (anticipation)', () => {
    const s = defaultSave(); // 1 slot
    const v = heroSlotView(s);
    expect(v).toHaveLength(HERO_SLOTS.length);
    expect(v[0].unlocked).toBe(true);
    expect(v[1].unlocked).toBe(false);
    expect(v[1].progress).toBe(0); // 0 / 25 stages
    expect(v[1].hint).toBeTruthy();
    expect(v[1].campaignReq).toBe(25);
    expect(v[2].campaignReq).toBe(90);
    expect(v[2].progress).toBeCloseTo(0, 6);
    s.campaign.cleared.standard = 45; // slot 3 needs stage 90 → 45/90 progress, still locked
    expect(heroSlotView(s)[2].unlocked).toBe(false);
    expect(heroSlotView(s)[2].progress).toBeCloseTo(0.5, 6);
    expect(heroSlotView(s)[2].campaignStage).toBe(45); // current-progress readout
  });

  it('migrates a pre-slot save: heroLoadout seeds from the legacy selectedHero', () => {
    const legacy = { ...defaultSave(), selectedHero: HERO_ORDER[2] } as Record<string, unknown>;
    delete legacy.heroLoadout; // a v10 save has no roster field
    const res = parseImport(JSON.stringify(legacy));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.heroLoadout).toEqual([HERO_ORDER[2]]);
  });
});

describe('multi-hero gameplay (the sim supports 1, 2, or 3 active heroes)', () => {
  it('defaults to a single hero (golden path)', () => {
    expect(new Game(3, NO_META).heroes.length).toBe(1);
  });

  it('fields the whole roster and every hero acts through a wave without throwing', () => {
    const roster = HERO_ORDER.slice(0, 3);
    const g = new Game(7, NO_META, undefined, roster[0], undefined, { heroRoster: roster });
    expect(g.heroes.map((h) => h.kind)).toEqual(roster);
    g.startWave();
    expect(() => { for (let i = 0; i < 900; i++) g.advance(SIM_DT); }).not.toThrow();
    // Every hero ran its lifecycle (finite hp, position on the field).
    for (const h of g.heroes) {
      expect(Number.isFinite(h.hp)).toBe(true);
      expect(Number.isFinite(h.x)).toBe(true);
    }
  });

  it('a duplicate-free roster is assumed; distinct kinds get distinct per-hero scaling state', () => {
    const g = new Game(2, NO_META, undefined, 'ravager', undefined, { heroRoster: HERO_ORDER.slice(0, 2) });
    expect(g.heroes[0].killchain).toBe(0);
    expect(g.heroes[1].rushUntil).toBe(0);
  });
});
