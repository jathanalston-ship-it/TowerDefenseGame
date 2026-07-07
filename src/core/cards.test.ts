import { describe, it, expect } from 'vitest';
import {
  CARD_POOL,
  draftCards,
  isCardUnlocked,
  defaultRunModifiers,
} from './cards';
import type { CardContext, CardProgress } from './cards';
import { Rng } from './rng';
import { Game } from './game';
import { SIM_DT, defaultMetaModifiers } from './config';
import { WIDTH, HEIGHT } from './map';

const NO_META = defaultMetaModifiers();

// The five progression-gated cards + the milestone each is meant to open behind.
const GATED_IDS = [
  'regenerative_carapace',
  'ambush_enzyme',
  'culling_instinct',
  'viral_payload',
  'toxic_aura',
] as const;

const NONE: CardProgress = { totalRuns: 0, bestWave: 0, bestStage: 0, stagesCleared: 0, bestEndlessWave: 0 };
const ALL: CardProgress = { totalRuns: 999, bestWave: 999, bestStage: 999, stagesCleared: 999, bestEndlessWave: 999 };

/** A card context whose grants are no-ops — enough to exercise stat/flag `apply`s. */
function ctx(): CardContext {
  return { mods: defaultRunModifiers(), grantBiomass() {}, grantIntegrity() {}, healHero() {} };
}

describe('gene card gating', () => {
  it('exactly the five milestone cards carry a gate; every gate is well-formed', () => {
    const gated = CARD_POOL.filter((c) => c.gate);
    expect(gated.map((c) => c.id).sort()).toEqual([...GATED_IDS].sort());
    for (const c of gated) {
      expect(c.gate!.requirement.length).toBeGreaterThan(0);
      expect(typeof c.gate!.test).toBe('function');
    }
  });

  it('ungated cards are always unlocked; gated cards need their milestone', () => {
    const ungated = CARD_POOL.filter((c) => !c.gate);
    for (const c of ungated) expect(isCardUnlocked(c, undefined)).toBe(true);

    const gate = (id: string) => CARD_POOL.find((c) => c.id === id)!;
    // Locked with no progress and with an empty account.
    for (const id of GATED_IDS) {
      expect(isCardUnlocked(gate(id), undefined)).toBe(false);
      expect(isCardUnlocked(gate(id), NONE)).toBe(false);
      expect(isCardUnlocked(gate(id), ALL)).toBe(true);
    }
    // Each gate keys off its OWN axis — a snapshot that meets only one milestone
    // unlocks only that card.
    expect(isCardUnlocked(gate('regenerative_carapace'), { ...NONE, totalRuns: 5 })).toBe(true);
    expect(isCardUnlocked(gate('ambush_enzyme'), { ...NONE, totalRuns: 5 })).toBe(false);
    expect(isCardUnlocked(gate('ambush_enzyme'), { ...NONE, bestWave: 8 })).toBe(true);
    expect(isCardUnlocked(gate('culling_instinct'), { ...NONE, bestStage: 5 })).toBe(true);
    expect(isCardUnlocked(gate('viral_payload'), { ...NONE, stagesCleared: 15 })).toBe(true);
    expect(isCardUnlocked(gate('toxic_aura'), { ...NONE, bestEndlessWave: 20 })).toBe(true);
  });

  it('draft never offers a gated card until it is unlocked; a maxed account can', () => {
    // 3000 draws with no progress: not one gated id may surface.
    const locked = new Rng(1234);
    for (let i = 0; i < 3000; i++) {
      for (const c of draftCards(locked, 3)) expect(c.gate).toBeUndefined();
    }
    // With every milestone met, each gated card is reachable in the draft.
    const seen = new Set<string>();
    const open = new Rng(1234);
    for (let i = 0; i < 3000; i++) for (const c of draftCards(open, 3, ALL)) seen.add(c.id);
    for (const id of GATED_IDS) expect(seen.has(id)).toBe(true);
  });

  it('the no-progress draft is deterministic (gating adds no hidden RNG draw)', () => {
    const a = draftCards(new Rng(99), 3).map((c) => c.id);
    const b = draftCards(new Rng(99), 3).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('GameConfig.cardProgress reaches the run draft (the UI injection seam)', () => {
    // No progress → gated cards never appear in a live draft.
    const locked = new Game(7, NO_META, { mode: 'classic' });
    const lockedSeen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      locked.debugOpenDraft();
      for (const c of locked.getSnapshot().draft!) lockedSeen.add(c.id);
    }
    expect(GATED_IDS.some((id) => lockedSeen.has(id))).toBe(false);

    // Maxed progress passed through the config → gated cards surface in the draft.
    const open = new Game(7, NO_META, { mode: 'classic', cardProgress: ALL });
    const openSeen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      open.debugOpenDraft();
      for (const c of open.getSnapshot().draft!) openSeen.add(c.id);
    }
    expect(GATED_IDS.some((id) => openSeen.has(id))).toBe(true);
  });
});

describe('gene card effects (knob mutation)', () => {
  it('each gated card writes exactly its RunModifiers knob', () => {
    const apply = (id: string) => {
      const c = ctx();
      CARD_POOL.find((d) => d.id === id)!.apply(c);
      return c.mods;
    };
    expect(apply('regenerative_carapace').integrityRegenPerWave).toBe(30);
    expect(apply('ambush_enzyme').firstStrikeBonus).toBeCloseTo(0.45);
    expect(apply('culling_instinct').executeThreshold).toBeCloseTo(0.1);
    expect(apply('viral_payload').killFractureSplash).toBe(2);
    expect(apply('toxic_aura').heroCorrosionAura).toBe(true);
  });
});

describe('gene card effects (in the running sim)', () => {
  it('Regenerative Carapace restores Integrity on wave clear', () => {
    const g = new Game(1, NO_META);
    g.debugApplyCard('regenerative_carapace');
    g.integrity = g.maxIntegrity - 100;
    const before = g.integrity;
    g.startWave();
    g.debugSkipWave(); // clear the wave → checkWaveEnd runs next step
    g.advance(SIM_DT);
    expect(g.integrity).toBe(before + 30);
  });

  it('Toxic Aura corrodes an enemy standing beside the hero', () => {
    const g = new Game(1, NO_META);
    g.debugApplyCard('toxic_aura');
    g.startWave();
    g.debugSpawn('runner', 1);
    const e = g.enemies[g.enemies.length - 1];
    // Park the hero and the enemy together in mid-field (clear of the base line).
    g.hero.x = WIDTH / 2;
    g.hero.y = HEIGHT / 2;
    e.x = WIDTH / 2;
    e.y = HEIGHT / 2 - 15;
    expect(e.corrosion).toBe(0);
    g.advance(SIM_DT);
    expect(e.corrosion).toBeGreaterThan(0);
  });

  it('Culling Instinct executes a low-health non-boss enemy', () => {
    const g = new Game(1, NO_META);
    g.debugApplyCard('culling_instinct');
    g.startWave();
    g.debugSpawn('brute', 1);
    const e = g.enemies[g.enemies.length - 1];
    e.shield = 0;
    e.hp = e.maxHp * 0.05; // below the 10% execute line
    // Drop the hero onto it so the next melee tick funnels through applyDamage.
    g.hero.x = e.x = WIDTH / 2;
    g.hero.y = HEIGHT / 2;
    e.y = HEIGHT / 2;
    let guard = 0;
    while (e.alive && guard++ < 240) g.advance(SIM_DT);
    expect(e.alive).toBe(false);
  });
});
